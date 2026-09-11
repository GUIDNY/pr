import { NextResponse } from "next/server";
import { randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { createSession, hashPassword } from "@/lib/auth";
import { exchangeCodeForProfile, googleOAuthConfigured } from "@/lib/google-oauth";
import { isBackOffice, backOfficeHome } from "@/lib/permissions";
import { SITE_URL } from "@/lib/site-url";
import { GOOGLE_RETURN_COOKIE, GOOGLE_STATE_COOKIE } from "../route";

export const dynamic = "force-dynamic";

function fail(reason: string) {
  return NextResponse.redirect(`${SITE_URL}/login?error=${reason}`);
}

/** Constant-time, and length-safe — timingSafeEqual throws on a length mismatch. */
function sameState(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * "התחברות עם Google", step two.
 *
 * Three things have to hold before anybody is signed in, and each is a real
 * door rather than a formality:
 *
 *   The state must match the cookie this browser was given. Without it, an
 *   attacker completes a Google sign-in of their own and sends the victim
 *   the resulting callback URL; the victim lands signed into the attacker's
 *   account and types their address into it.
 *
 *   Google must say the address is verified. An unverified email claim is
 *   somebody asserting an address, not proving it — and because a matching
 *   address here signs you into that account, accepting one would be a way
 *   to walk into any existing customer's orders by naming their email.
 *
 *   The account it finds or makes is a customer. Roles come from the row in
 *   the database and are given by a person; nothing about arriving through
 *   Google may grant one.
 *
 * An address that already has an account signs into it. That is deliberate
 * and it is why the verified check above is not negotiable: somebody who
 * registered with a password and later presses this button is the same
 * person, and making them two accounts would split their order history in
 * half.
 */
export async function GET(request: Request) {
  if (!googleOAuthConfigured()) return fail("google_unavailable");

  const url = new URL(request.url);
  const jar = await cookies();
  const expected = jar.get(GOOGLE_STATE_COOKIE)?.value;
  const returnTo = jar.get(GOOGLE_RETURN_COOKIE)?.value ?? "/account";

  // Single use, whatever happens next.
  jar.delete(GOOGLE_STATE_COOKIE);
  jar.delete(GOOGLE_RETURN_COOKIE);

  // Somebody pressed "cancel" on Google's screen.
  if (url.searchParams.get("error")) return fail("google_cancelled");

  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!state || !expected || !sameState(state, expected)) return fail("google_state");
  if (!code) return fail("google_code");

  const profile = await exchangeCodeForProfile(code);
  if (!profile) return fail("google_exchange");
  if (!profile.emailVerified) return fail("google_unverified");

  let user = await db.user.findUnique({ where: { email: profile.email } });

  if (!user) {
    /* Every account needs a passwordHash, and this one must never open. A
       hash of 32 random bytes nobody keeps is not a password anybody can
       type — the account is reachable through Google only, until its owner
       is given a way to set one. */
    const unusable = await hashPassword(randomBytes(32).toString("base64url"));
    user = await db.user.create({
      data: { email: profile.email, name: profile.name, passwordHash: unusable, role: "CUSTOMER" },
    });

    /* The same claim the password sign-up makes, for the same reason: a
       first order is usually placed as a guest, and without this it stays
       ownerless while its owner is looking at an empty order list. Verified
       by Google, which is a stronger proof than typing the address in. */
    await db.order.updateMany({
      where: {
        userId: null,
        guestEmail: { equals: profile.email, mode: "insensitive" },
        ownerDeletedAt: null,
      },
      data: { userId: user.id },
    });
  }

  await createSession({ sub: user.id, role: user.role as never, name: user.name });

  const destination = isBackOffice(user.role) ? backOfficeHome(user.role) : returnTo;
  return NextResponse.redirect(`${SITE_URL}${destination}`);
}
