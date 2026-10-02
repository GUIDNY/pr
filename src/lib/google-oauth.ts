import "server-only";
import { jwtVerify, createRemoteJWKSet } from "jose";
import { SITE_URL } from "@/lib/site-url";

/**
 * Signing in with Google, against the session this app already has.
 *
 * Written by hand rather than by adopting NextAuth, and that is the whole
 * design decision here. This application's session is a signed JWT in one
 * cookie, and every guard in it — requireAdmin, requireBackOffice, the
 * middleware, the seller's order queue — reads that. Swapping the session
 * layer to bring in one sign-in button means re-proving all of them at once,
 * on a live shop, to add a convenience. The OAuth exchange below is about
 * sixty lines and ends by calling the same createSession as the password
 * form, so nothing downstream can tell the difference.
 *
 * The redirect URI is fixed rather than derived from the incoming request.
 * Google matches it character for character against what is registered in
 * the console, and a value taken from a header is a value an attacker can
 * influence.
 */

export const GOOGLE_CALLBACK_PATH = "/api/auth/google/callback";

function clientId(): string | null {
  const value = process.env.GOOGLE_CLIENT_ID?.trim();
  return value ? value : null;
}

function clientSecret(): string | null {
  const value = process.env.GOOGLE_CLIENT_SECRET?.trim();
  return value ? value : null;
}

/**
 * The credentials the native sign-in sheet runs on, one per platform.
 *
 * Google issues a separate OAuth client per platform and puts whichever one
 * asked into the id_token's `aud`, so the two are not interchangeable: a
 * token minted for one is not valid for the other, and the audience check
 * below has to know both.
 *
 * iOS initialises the sheet with the **iOS** client and gets `aud` = that.
 * Android initialises it with the **web** client — the one the site's own
 * redirect flow already uses — and gets `aud` = that. Android's own client
 * exists and is not named here on purpose: it carries the APK's signing
 * fingerprint and is what lets Google trust the caller, but it is never sent
 * in a request and never appears in a token.
 *
 * Both are read from the server's own environment and handed to the page by
 * `GET /api/auth/google/native`, rather than inlined into the browser bundle
 * at build time. That is deliberate and it is the fix for a real outage: the
 * iOS id used to be read in both places, and a value pasted into a dashboard
 * with a trailing newline read as configured on one side and as a different
 * string on the other. Google derives its callback scheme by reversing the id
 * around the dots, so one invisible character produced a scheme the app never
 * registered and the SDK answered with a native crash. One reader cannot
 * disagree with itself.
 */
export type GoogleNativeClientIds = { ios: string; web: string };

export function googleNativeClientIds(): GoogleNativeClientIds | null {
  const ios = iosClientId();
  const web = clientId();
  if (!ios || !web) return null;
  return { ios, web };
}

/**
 * Both platforms' credentials present. The button is hidden until they are.
 *
 * Both, not either, and the asymmetry is only apparent: the web client id is
 * `GOOGLE_CLIENT_ID`, without which the site's own Google sign-in does not
 * work either. There is no configuration where one is deliberately set and
 * the other deliberately not.
 */
export function googleNativeConfigured(): boolean {
  return googleNativeClientIds() !== null;
}

/**
 * NEXT_PUBLIC_ is a leftover from when the browser read this directly, and is
 * harmless: an OAuth client id is a public identifier by design and nothing
 * is protected by hiding it. Nothing reads it client-side any more.
 */
function iosClientId(): string | null {
  const value = process.env.NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
  return value ? value : null;
}

export function googleOAuthConfigured(): boolean {
  return clientId() !== null && clientSecret() !== null;
}

export function googleRedirectUri(): string {
  return `${SITE_URL}${GOOGLE_CALLBACK_PATH}`;
}

/**
 * Where to send somebody who pressed the button.
 *
 * `state` is the CSRF defence and is not optional: without it, an attacker
 * can complete their own Google sign-in and hand the victim's browser the
 * resulting callback URL, silently signing the victim into the attacker's
 * account. The caller stores the same value in an httpOnly cookie and the
 * callback refuses when the two disagree.
 *
 * Scope is the minimum that answers "who is this": the profile and the email
 * address. No Drive, no contacts, nothing that would put this app in front
 * of Google's verification review.
 */
export function googleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: clientId()!,
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    // Ask every time rather than silently reusing a session: on a shared
    // computer, "sign in with Google" that picks the last account without
    // asking is how somebody ends up in a stranger's order history.
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export type GoogleProfile = {
  email: string;
  name: string;
  /** Google's own account id, stable across email changes. */
  sub: string;
  emailVerified: boolean;
};

/**
 * Trade the one-time code for the person behind it.
 *
 * The id_token is read rather than verified against Google's public keys,
 * and that is safe only because of where it came from: this is the response
 * body of a direct server-to-server POST to accounts.google.com over TLS,
 * authenticated with the client secret. Nothing between here and Google
 * could have written it. An id_token arriving any other way — from a
 * browser, from a query string — would have to be verified properly.
 */
export async function exchangeCodeForProfile(code: string): Promise<GoogleProfile | null> {
  const id = clientId();
  const secret = clientSecret();
  if (!id || !secret) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: id,
      client_secret: secret,
      redirect_uri: googleRedirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) return null;

  const token = (await res.json()) as { id_token?: string };
  if (!token.id_token) return null;

  const claims = decodeJwtPayload(token.id_token);
  if (!claims) return null;

  const email = typeof claims.email === "string" ? claims.email.toLowerCase() : null;
  const sub = typeof claims.sub === "string" ? claims.sub : null;
  if (!email || !sub) return null;

  return {
    email,
    sub,
    name: typeof claims.name === "string" && claims.name.trim() ? claims.name.trim() : email.split("@")[0],
    // Google sends this as a boolean or the string "true" depending on the
    // flow. Anything else is treated as unverified.
    emailVerified: claims.email_verified === true || claims.email_verified === "true",
  };
}

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const segment = jwt.split(".")[1];
  if (!segment) return null;
  try {
    const json = Buffer.from(segment.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/* Google's public keys, cached by jose, re-fetched when a token arrives
   signed by a kid it has not seen — so key rotation is a non-event. */
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

/**
 * The person behind an id_token that came from the native sign-in sheet.
 *
 * THIS ONE IS VERIFIED, and the contrast with exchangeCodeForProfile above is
 * the point. That token is the body of a direct server-to-server POST to
 * Google, over TLS, authenticated with the client secret, so reading it is
 * enough — and its own comment warns that a token arriving any other way
 * would have to be verified properly. This is that other way. It comes from a
 * phone, where the email is a claim inside a string the caller supplies, so
 * anything less than a signature check would let anybody sign in as anybody.
 *
 * `aud` is this project's own clients and nothing else — the iOS one for a
 * token from the iOS sheet, the web one for a token from Android's. Both are
 * accepted because both are minted here; anything else is a token for a
 * different app.
 *
 * Accepting the web client id is worth being explicit about, because it is
 * also the audience of the tokens the site's own redirect flow receives. It
 * is not a way in: a token carrying that audience can only be obtained by
 * completing an authorisation against a registered redirect URI or a
 * registered origin, which is the same bar Google sets for the flow next
 * door. What it is not is a token anybody can mint.
 *
 * Both issuer spellings are allowed because Google uses both, and has for
 * years — a token signed by the same keys is rejected by the stricter of the
 * two for no reason anybody can act on.
 */
export async function verifyGoogleIdToken(token: string): Promise<GoogleProfile | null> {
  const ids = googleNativeClientIds();
  if (!ids) return null;
  const audience = [ids.ios, ids.web];

  let claims: Record<string, unknown>;
  try {
    const verified = await jwtVerify(token, GOOGLE_JWKS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience,
    });
    claims = verified.payload as Record<string, unknown>;
  } catch {
    // Expiry, a bad signature and a wrong audience all land here, and the
    // caller is told none of them apart.
    return null;
  }

  const email = typeof claims.email === "string" ? claims.email.toLowerCase() : null;
  const sub = typeof claims.sub === "string" ? claims.sub : null;
  if (!email || !sub) return null;

  return {
    email,
    sub,
    name: typeof claims.name === "string" && claims.name.trim() ? claims.name.trim() : email.split("@")[0],
    emailVerified: claims.email_verified === true || claims.email_verified === "true",
  };
}
