import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { CART_COOKIE } from "@/lib/cart";
import { referrerOf } from "@/lib/referral";
import { REFERRAL_COOKIE, REFERRAL_COOKIE_DAYS } from "@/lib/referral-rules";

/**
 * A friend's referral link: buytoday.co.il/r/REF-XXXXXX.
 *
 * Remembers the code for REFERRAL_COOKIE_DAYS (a cart created later starts
 * with it — see lib/cart.ts), puts it on the visitor's cart now if they
 * already have one with no coupon, and sends them to the shop with a
 * welcome. An unknown code goes to the shop with nothing set: a mistyped
 * link should still land somewhere useful. A coupon the visitor already
 * chose is never replaced.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const code = decodeURIComponent((await params).code).trim().toUpperCase();
  const home = new URL("/", req.url);
  const referrerId = await referrerOf(code);
  if (!referrerId) return NextResponse.redirect(home);

  home.searchParams.set("friend", "1");
  const res = NextResponse.redirect(home);
  res.cookies.set(REFERRAL_COOKIE, code, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: REFERRAL_COOKIE_DAYS * 86400,
  });

  /* A cart that already exists, without a coupon of its own. */
  const session = await getSession();
  const sid = (await cookies()).get(CART_COOKIE)?.value;
  const where = session ? { userId: session.sub } : sid ? { sessionId: sid } : null;
  if (where && session?.sub !== referrerId) {
    await db.cart.updateMany({ where: { ...where, couponCode: null }, data: { couponCode: code } }).catch(() => {});
  }
  return res;
}
