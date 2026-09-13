import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { appleAuthUrl, appleOAuthConfigured } from "@/lib/apple-oauth";
import { SITE_URL } from "@/lib/site-url";

export const dynamic = "force-dynamic";

/** Ten minutes is longer than anybody takes to approve a sign-in. */
const STATE_TTL_SECONDS = 600;
export const APPLE_STATE_COOKIE = "apple_oauth_state";
export const APPLE_NONCE_COOKIE = "apple_oauth_nonce";
export const APPLE_RETURN_COOKIE = "apple_oauth_return";

/**
 * "התחברות עם Apple", step one.
 *
 * Same shape as the Google entry point, with one line that is not a
 * preference and will cost an afternoon if it is copied across.
 */
export async function GET(request: Request) {
  if (!appleOAuthConfigured()) {
    return NextResponse.redirect(`${SITE_URL}/login?error=apple_unavailable`);
  }

  const requested = new URL(request.url).searchParams.get("redirect");
  // Same-site paths only: an open redirect here would let this endpoint
  // bounce people elsewhere with our domain in the link they were sent.
  const returnTo = requested && requested.startsWith("/") && !requested.startsWith("//") ? requested : "/account";

  const state = randomBytes(32).toString("base64url");
  const nonce = randomBytes(32).toString("base64url");

  /* SameSite=None, where the Google flow uses Lax.
   *
   * Apple does not return the visitor with a GET. It form-posts to the
   * return URL from appleid.apple.com — a cross-site POST as far as the
   * browser is concerned — and a browser does not attach a Lax cookie to
   * one. So a Lax state cookie simply never arrives, and the callback
   * rejects every legitimate sign-in with "apple_state", an error whose
   * text points nowhere near the cause.
   *
   * None requires Secure, which means this works over HTTPS only: on
   * localhost the cookie is dropped, so this flow is testable in production
   * or on a preview URL and not on a laptop. That is a real cost and it is
   * the price of the protocol, not a choice made here.
   */
  const options = {
    httpOnly: true,
    secure: true,
    sameSite: "none" as const,
    path: "/",
    maxAge: STATE_TTL_SECONDS,
  };

  const jar = await cookies();
  jar.set(APPLE_STATE_COOKIE, state, options);
  jar.set(APPLE_NONCE_COOKIE, nonce, options);
  jar.set(APPLE_RETURN_COOKIE, returnTo, options);

  return NextResponse.redirect(appleAuthUrl(state, nonce));
}
