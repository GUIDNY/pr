import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { googleAuthUrl, googleOAuthConfigured } from "@/lib/google-oauth";
import { SITE_URL } from "@/lib/site-url";

export const dynamic = "force-dynamic";

/** Ten minutes is longer than anybody takes to pick a Google account. */
const STATE_TTL_SECONDS = 600;
export const GOOGLE_STATE_COOKIE = "google_oauth_state";
export const GOOGLE_RETURN_COOKIE = "google_oauth_return";

/**
 * "התחברות עם Google", step one.
 *
 * Mints a random state, keeps a copy in an httpOnly cookie, and sends the
 * browser to Google with the same value. The callback compares them, which
 * is what stops somebody completing their own Google sign-in and then
 * handing the victim the resulting callback URL — a real attack that signs
 * the victim into the attacker's account without either of them noticing.
 *
 * Where to land afterwards travels in its own cookie rather than in the
 * state or the redirect URI. Google matches the redirect URI exactly, so it
 * cannot carry a query string, and putting a destination inside a value that
 * is compared for equality invites someone to try to bend the comparison.
 */
export async function GET(request: Request) {
  if (!googleOAuthConfigured()) {
    return NextResponse.redirect(`${SITE_URL}/login?error=google_unavailable`);
  }

  const requested = new URL(request.url).searchParams.get("redirect");
  // Only same-site paths: an open redirect here would let this endpoint be
  // used to bounce people to somewhere else entirely, with our domain in the
  // link they were sent.
  const returnTo = requested && requested.startsWith("/") && !requested.startsWith("//") ? requested : "/account";

  const state = randomBytes(32).toString("base64url");
  const jar = await cookies();
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: STATE_TTL_SECONDS,
  };
  jar.set(GOOGLE_STATE_COOKIE, state, options);
  jar.set(GOOGLE_RETURN_COOKIE, returnTo, options);

  return NextResponse.redirect(googleAuthUrl(state));
}
