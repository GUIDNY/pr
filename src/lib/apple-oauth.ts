import "server-only";
import { SignJWT, importPKCS8 } from "jose";
import { SITE_URL } from "@/lib/site-url";

/**
 * Signing in with Apple, against the session this app already has.
 *
 * The twin of google-oauth.ts, and deliberately so: same shape, same
 * hand-rolled approach, ending in the same createSession the password form
 * calls. Three things are genuinely different, and each one is a place this
 * breaks silently if it is written the Google way.
 *
 * THE CLIENT SECRET IS NOT A SECRET ANYBODY STORES. Google hands you a
 * string and you keep it. Apple hands you a signing key and you mint a
 * short-lived JWT with it on every exchange. Signed per request rather than
 * cached: Apple allows up to six months, and a cached secret is a secret
 * that expires in the middle of some Tuesday half a year from now with
 * nobody left who remembers why sign-in stopped. Signing costs under a
 * millisecond, once per sign-in.
 *
 * THE ANSWER COMES BACK AS A CROSS-SITE POST. Asking for the name or email
 * scope makes Apple refuse to reply in a query string; it replies with a
 * form post to the return URL. That is why the callback is a POST handler
 * and why the state cookies it reads must be SameSite=None.
 *
 * THE NAME ARRIVES ONCE, EVER. Apple sends it on the first authorisation and
 * never again — not on the next sign-in, not after a failed attempt. The
 * callback reads it the moment it arrives or does without it forever.
 *
 * There is no domain-verification file to host. Apple's own documentation is
 * explicit that the domains and subdomains list needs no upload; it is
 * matched against the redirect URI as a string. (That requirement existed
 * until around 2020 and was removed — the file by that name now belongs to
 * the separate Hide My Email sender-domain registration.)
 */

export const APPLE_CALLBACK_PATH = "/api/auth/apple/callback";

function env(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

/** All four present. The button is hidden until they are. */
export function appleOAuthConfigured(): boolean {
  return (
    env("APPLE_SERVICES_ID") !== null &&
    env("APPLE_TEAM_ID") !== null &&
    env("APPLE_KEY_ID") !== null &&
    env("APPLE_PRIVATE_KEY") !== null
  );
}

export function appleRedirectUri(): string {
  return `${SITE_URL}${APPLE_CALLBACK_PATH}`;
}

/**
 * The .p8, rebuilt into the shape a PEM parser will accept.
 *
 * A private key travels badly. Between the file Apple issues once and the
 * value this function reads there is a clipboard, a browser text field, a
 * dashboard and sometimes a shell, and each of them has its own opinion
 * about line breaks. What arrives is the right key material in the wrong
 * wrapper: newlines turned into literal backslash-n, or into spaces, or
 * removed altogether so the whole thing is one long line.
 *
 * Accepting only the pristine form was the first version of this, and it
 * failed in production on the first real attempt with `"pkcs8" must be
 * PKCS#8 formatted string` — a message that sounds like the key is wrong
 * when the key was fine and only its whitespace was not.
 *
 * So the base64 is taken out of whatever arrived and a correct PEM is built
 * around it. That is reformatting, not repair: a key that is genuinely the
 * wrong key, or truncated, still fails here, and should.
 */
function privateKeyPem(): string {
  const raw = env("APPLE_PRIVATE_KEY")!.replace(/\\n/g, "\n").trim();

  // Everything that is not the payload: the header, the footer, and every
  // kind of whitespace somebody's clipboard left behind.
  const body = raw
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----/g, "")
    .replace(/-----END [A-Z ]*PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");

  // PEM wants its base64 in lines of 64. Some parsers tolerate one long
  // line; not all of them do, and this is not the place to find out which.
  const wrapped = body.match(/.{1,64}/g)?.join("\n") ?? body;
  return `-----BEGIN PRIVATE KEY-----\n${wrapped}\n-----END PRIVATE KEY-----\n`;
}

async function clientSecret(): Promise<string> {
  const key = await importPKCS8(privateKeyPem(), "ES256");
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: env("APPLE_KEY_ID")! })
    .setIssuer(env("APPLE_TEAM_ID")!) // the team, not the app
    .setSubject(env("APPLE_SERVICES_ID")!) // the Services ID — NOT the bundle id
    .setAudience("https://appleid.apple.com")
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(key);
}

/**
 * Where to send somebody who pressed the button.
 *
 * `state` is the CSRF defence, exactly as in the Google flow: without it an
 * attacker completes a sign-in of their own and hands the victim's browser
 * the resulting callback, quietly signing the victim into the attacker's
 * account.
 *
 * `nonce` is the second half and is not the same thing. State proves the
 * request started here; nonce proves the identity token coming back was
 * minted for this request and is not one seen before.
 */
export function appleAuthUrl(state: string, nonce: string): string {
  const params = new URLSearchParams({
    client_id: env("APPLE_SERVICES_ID")!,
    redirect_uri: appleRedirectUri(),
    response_type: "code",
    // Not a preference: with a name or email scope Apple will not answer in
    // a query string. This is what makes the callback a POST.
    response_mode: "form_post",
    scope: "name email",
    state,
    nonce,
  });
  return `https://appleid.apple.com/auth/authorize?${params}`;
}

export type AppleProfile = {
  email: string;
  /** Apple's own account id, stable even when the address changes. */
  sub: string;
  emailVerified: boolean;
  /** True when the address is an @privaterelay.appleid.com forwarder. */
  isPrivateRelay: boolean;
  nonce: string | null;
};

export type AppleExchange = { ok: true; profile: AppleProfile } | { ok: false; detail: string };

/**
 * Trade the one-time code for the person behind it.
 *
 * The id_token is read rather than verified against Apple's public keys, for
 * the same reason the Google exchange reads its own: this is the body of a
 * direct server-to-server POST to appleid.apple.com over TLS, authenticated
 * by a secret only this server can mint. Nothing in between could have
 * written it. An id_token arriving any other way would have to be verified
 * properly.
 *
 * Failures carry Apple's own words back to the caller. Every way of getting
 * the client secret wrong — the bundle id in `sub`, a stale `kid`, a return
 * URL off by a trailing slash — produces one flat "invalid_client", and
 * without the response body somebody is left guessing which of the four it
 * was.
 */
export async function exchangeCodeForProfile(code: string): Promise<AppleExchange> {
  if (!appleOAuthConfigured()) return { ok: false, detail: "not configured" };

  let secret: string;
  try {
    secret = await clientSecret();
  } catch (error) {
    // Almost always the .p8 arriving mangled — re-saved by a text editor,
    // or pasted without its BEGIN/END lines.
    return { ok: false, detail: `client secret: ${(error as Error).message}` };
  }

  const res = await fetch("https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env("APPLE_SERVICES_ID")!,
      client_secret: secret,
      redirect_uri: appleRedirectUri(),
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, detail: `token ${res.status}: ${body.slice(0, 300)}` };
  }

  const token = (await res.json()) as { id_token?: string };
  if (!token.id_token) return { ok: false, detail: "no id_token in response" };

  const claims = decodeJwtPayload(token.id_token);
  if (!claims) return { ok: false, detail: "id_token payload unreadable" };

  const email = typeof claims.email === "string" ? claims.email.toLowerCase() : null;
  const sub = typeof claims.sub === "string" ? claims.sub : null;
  if (!email || !sub) return { ok: false, detail: "id_token missing email or sub" };

  return {
    ok: true,
    profile: {
      email,
      sub,
      // Apple sends these as a boolean or the string "true" depending on the
      // flow. Anything else is treated as false.
      emailVerified: claims.email_verified === true || claims.email_verified === "true",
      isPrivateRelay: claims.is_private_email === true || claims.is_private_email === "true",
      nonce: typeof claims.nonce === "string" ? claims.nonce : null,
    },
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
