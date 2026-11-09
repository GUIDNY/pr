import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { CART_COOKIE } from "@/lib/cart";
import { attachReferral, referrerOf } from "@/lib/referral";
import { REFERRAL_COOKIE, REFERRAL_COOKIE_DAYS, REFERRAL_FLAG_COOKIE } from "@/lib/referral-rules";

/**
 * A friend's referral link: buytoday.co.il/r/REF-XXXXXX.
 *
 * The discount belongs to an account (owner, 9 November), so it works from
 * whatever device the friend later buys on:
 *   - signed in already: the account is tied to the referrer now, and the
 *     visitor goes to the shop with the discount on their cart;
 *   - not signed in: the code is kept in a cookie and the visitor goes to
 *     sign-up, which ties the new account to it (so does signing in to an
 *     existing one — see attachReferral). A guest cart gets the code too,
 *     and the cart then says the discount needs an account.
 * An unknown code goes to the shop with nothing set.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const code = decodeURIComponent((await params).code).trim().toUpperCase();
  const referrerId = await referrerOf(code);
  if (!referrerId) return NextResponse.redirect(new URL("/", req.url));

  const session = await getSession();
  if (session) {
    if (session.sub !== referrerId) await attachReferral(session.sub, code);
    const home = new URL("/", req.url);
    home.searchParams.set("friend", "1");
    return NextResponse.redirect(home);
  }

  const register = new URL("/register", req.url);
  register.searchParams.set("friend", "1");
  const res = NextResponse.redirect(register);
  const cookie = { sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: REFERRAL_COOKIE_DAYS * 86400 };
  res.cookies.set(REFERRAL_COOKIE, code, { ...cookie, httpOnly: true });
  res.cookies.set(REFERRAL_FLAG_COOKIE, "1", { ...cookie, httpOnly: false });

  const sid = (await cookies()).get(CART_COOKIE)?.value;
  if (sid) await db.cart.updateMany({ where: { sessionId: sid, couponCode: null }, data: { couponCode: code } }).catch(() => {});
  return res;
}
