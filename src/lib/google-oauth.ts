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

/** Both halves present. The button is hidden until they are. */
/**
 * The iOS OAuth client id, which is the audience Google puts in an id_token
 * issued to the native sign-in sheet — where the web client id is the
 * audience instead. The two are different credentials for the same project,
 * and a token minted for one is not valid for the other.
 *
 * Required rather than defaulted, for the same reason as Apple's bundle id:
 * an audience check that falls back to a guess is not a check.
 */
export function googleNativeConfigured(): boolean {
  return (process.env.GOOGLE_IOS_CLIENT_ID?.trim() ?? "") !== "";
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
 * `aud` is the iOS client id and not the web one. Google issues a separate
 * credential per platform, and accepting either would mean accepting a token
 * minted for a different app.
 *
 * Both issuer spellings are allowed because Google uses both, and has for
 * years — a token signed by the same keys is rejected by the stricter of the
 * two for no reason anybody can act on.
 */
export async function verifyGoogleIdToken(token: string): Promise<GoogleProfile | null> {
  const audience = process.env.GOOGLE_IOS_CLIENT_ID?.trim();
  if (!audience) return null;

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
