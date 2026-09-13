import { NextResponse } from "next/server";
import { randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { createSession, hashPassword } from "@/lib/auth";
import { appleOAuthConfigured, exchangeCodeForProfile } from "@/lib/apple-oauth";
import { isBackOffice, backOfficeHome } from "@/lib/permissions";
import { SITE_URL } from "@/lib/site-url";
import { APPLE_NONCE_COOKIE, APPLE_RETURN_COOKIE, APPLE_STATE_COOKIE } from "../route";

export const dynamic = "force-dynamic";

/* 303 and not the default 307: what arrived here is a POST, and a 307
   preserves the method — the browser would post again to /login. */
function fail(reason: string) {
  return NextResponse.redirect(`${SITE_URL}/login?error=${reason}`, 303);
}

/** Constant-time, and length-safe — timingSafeEqual throws on a mismatch. */
function sameValue(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * "התחברות עם Apple", step two — and a POST, which is the whole reason this
 * file does not simply mirror the Google callback.
 *
 * Four things must hold before anybody is signed in:
 *
 *   The state matches the cookie this browser was given. Without it an
 *   attacker completes an Apple sign-in of their own and sends the victim
 *   the resulting callback; the victim lands inside the attacker's account.
 *
 *   The nonce in the identity token matches the one minted for this attempt.
 *   State proves the request started here; nonce proves the token coming
 *   back was minted for this request rather than replayed from an earlier
 *   one.
 *
 *   Apple says the address is verified. A matching address signs you into
 *   that account, so accepting an unverified claim would be a way into any
 *   existing customer's orders by naming their email.
 *
 *   The account it finds or creates is a customer. Roles live in the
 *   database row and are given by a person; arriving through Apple grants
 *   nothing.
 *
 * An address that already has an account signs into it, exactly as with
 * Google — the same person pressing a different button should not end up
 * with their order history split in half.
 */
export async function POST(request: Request) {
  if (!appleOAuthConfigured()) return fail("apple_unavailable");

  const form = await request.formData();
  const jar = await cookies();
  const expectedState = jar.get(APPLE_STATE_COOKIE)?.value;
  const expectedNonce = jar.get(APPLE_NONCE_COOKIE)?.value;
  const returnTo = jar.get(APPLE_RETURN_COOKIE)?.value ?? "/account";

  // Single use, whatever happens next.
  jar.delete(APPLE_STATE_COOKIE);
  jar.delete(APPLE_NONCE_COOKIE);
  jar.delete(APPLE_RETURN_COOKIE);

  // Somebody pressed cancel on Apple's screen.
  if (form.get("error")) return fail("apple_cancelled");

  const state = form.get("state");
  const code = form.get("code");
  if (typeof state !== "string" || !expectedState || !sameValue(state, expectedState)) {
    return fail("apple_state");
  }
  if (typeof code !== "string" || !code) return fail("apple_code");

  const exchange = await exchangeCodeForProfile(code);
  if (!exchange.ok) {
    /* Apple answers every misconfiguration with one flat "invalid_client" —
       the bundle id where the Services ID belongs, a stale key id, a return
       URL differing by a trailing slash. Its own words go to the log so the
       next person reads the cause instead of guessing between four. */
    console.error("[apple] token exchange failed:", exchange.detail);
    return fail("apple_exchange");
  }

  const profile = exchange.profile;
  if (!expectedNonce || profile.nonce !== expectedNonce) return fail("apple_nonce");
  if (!profile.emailVerified) return fail("apple_unverified");

  /* The name arrives once in a lifetime.
   *
   * Apple sends the `user` field — the only place a name appears — on the
   * first authorisation and never again. Not on the next sign-in, and not
   * on a retry after this one fails. So it is read here, at the only moment
   * it exists, and an account created without it falls back to the local
   * part of the address, as the Google flow does. */
  let name: string | null = null;
  const raw = form.get("user");
  if (typeof raw === "string" && raw) {
    try {
      const parsed = JSON.parse(raw) as { name?: { firstName?: string; lastName?: string } };
      const full = [parsed.name?.firstName, parsed.name?.lastName].filter(Boolean).join(" ").trim();
      if (full) name = full;
    } catch {
      // A malformed name is not a reason to refuse somebody entry.
    }
  }

  let user = await db.user.findUnique({ where: { email: profile.email } });

  if (!user) {
    /* Every account needs a passwordHash and this one must never open. A
       hash of 32 random bytes nobody keeps is not a password anybody can
       type — the account is reachable through Apple only, until its owner
       sets one from the account page. */
    const unusable = await hashPassword(randomBytes(32).toString("base64url"));
    user = await db.user.create({
      data: {
        email: profile.email,
        name: name ?? profile.email.split("@")[0],
        passwordHash: unusable,
        hasPassword: false,
        role: "CUSTOMER",
      },
    });

    /* The same claim the password sign-up and the Google flow make: a first
       order is usually placed as a guest, and without this it stays
       ownerless while its owner looks at an empty order list. */
    await db.order.updateMany({
      where: {
        userId: null,
        guestEmail: { equals: profile.email, mode: "insensitive" },
        ownerDeletedAt: null,
      },
      data: { userId: user.id },
    });
  } else if (name && isPlaceholderName(user.name, user.email)) {
    /* An account that only ever had the local part of its address as a name
       — because an earlier attempt arrived without one — takes the real
       name the first time Apple supplies it. A name somebody actually chose
       is never overwritten. */
    user = await db.user.update({ where: { id: user.id }, data: { name } });
  }

  await createSession({ sub: user.id, role: user.role as never, name: user.name });

  const destination = isBackOffice(user.role) ? backOfficeHome(user.role) : returnTo;
  return NextResponse.redirect(`${SITE_URL}${destination}`, 303);
}

/** Is this name the email's local part rather than something a person chose? */
function isPlaceholderName(name: string, email: string): boolean {
  return name.trim().toLowerCase() === email.split("@")[0].toLowerCase();
}
