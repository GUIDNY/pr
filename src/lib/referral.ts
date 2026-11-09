import "server-only";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { hasMemberCoupon, issueMemberCoupon } from "@/lib/member-coupons";
import {
  REFERRAL_COOKIE,
  REFERRAL_FLAG_COOKIE,
  REFERRAL_CODE_PREFIX,
  REFERRAL_FRIEND_PERCENT,
  REFERRAL_REWARD_DAYS,
  qualifiesForReferral,
  referralRewardFor,
} from "@/lib/referral-rules";

/**
 * חבר מביא חבר — the parts that touch the database. The rules themselves
 * are in referral-rules.ts.
 *
 * One code per account, kept as a MemberCoupon of kind "ref-link" beside
 * the Promotion that is the friend's discount: REF-XXXXXX, 5% off the cart,
 * first order only, once per customer. It is never retired — retireGameCoupon
 * touches GAME- codes only — because the same link is meant for every friend.
 *
 * How the friend is tied to the referrer: the link /r/<code> sets a cookie
 * and puts the code on the cart, so the order that follows carries it in
 * Order.couponCode. When that order is paid, awardReferral looks the code up
 * and, if the order is big enough and the friend is not the referrer, issues
 * the referrer a personal gift coupon (a GAME- code, so it is good for one
 * order, like every other club coupon) at the step this friend reached.
 */
const LINK_KIND = "ref-link";
const REWARD_KIND = "ref-reward:";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function newCode(): string {
  return REFERRAL_CODE_PREFIX + Array.from(randomBytes(6), (x) => CODE_ALPHABET[x % CODE_ALPHABET.length]).join("");
}

/** This account's referral code, created the first time it is asked for. */
export async function referralCodeFor(userId: string): Promise<string> {
  const existing = await db.memberCoupon.findFirst({ where: { userId, kind: LINK_KIND }, select: { code: true } });
  if (existing) return existing.code;
  let code = newCode();
  for (let i = 0; i < 5 && (await db.promotion.findUnique({ where: { code } })); i++) code = newCode();
  await db.$transaction([
    db.memberCoupon.create({ data: { code, userId, kind: LINK_KIND } }),
    db.promotion.create({
      data: {
        name: `חבר מביא חבר · ${REFERRAL_FRIEND_PERCENT}% לחבר בהזמנה הראשונה`,
        code,
        type: "PERCENTAGE",
        value: REFERRAL_FRIEND_PERCENT,
        scope: "CART",
        isActive: true,
        firstOrderOnly: true,
        perCustomerLimit: 1,
        /* Registered accounts only — the discount lives on the account so it
           works from any device (owner, 9 November). */
        membersOnly: true,
        description: `${REFERRAL_FRIEND_PERCENT}% הנחה בהזמנה הראשונה — בזכות חבר`,
      },
    }),
  ]);
  return code;
}

/** Who owns a referral code, or null when it is not one. */
export async function referrerOf(code: string | null | undefined): Promise<string | null> {
  if (!code || !code.toUpperCase().startsWith(REFERRAL_CODE_PREFIX)) return null;
  const row = await db.memberCoupon.findFirst({ where: { code: code.toUpperCase(), kind: LINK_KIND }, select: { userId: true } });
  return row?.userId ?? null;
}

/** How many friends have earned this account a gift so far, and the next one's value. */
export async function referralProgress(userId: string) {
  const earned = await db.memberCoupon.count({ where: { userId, kind: { startsWith: REWARD_KIND } } });
  return { friends: earned, nextReward: referralRewardFor(earned + 1) };
}

/**
 * A paid order: if it came through a friend's link, reward the friend who
 * sent it. Once per order (the reward's kind names the order), never for a
 * referrer's own order, never for an order under the minimum. Never throws —
 * a gift is a courtesy, the payment record is not.
 */
export async function awardReferral(orderId: string): Promise<void> {
  try {
    const order = await db.order.findUnique({
      where: { id: orderId },
      select: {
        orderNumber: true,
        couponCode: true,
        userId: true,
        guestEmail: true,
        subtotal: true,
        discountTotal: true,
        user: { select: { email: true } },
      },
    });
    if (!order) return;
    const referrerId = await referrerOf(order.couponCode);
    if (!referrerId) return;
    if (!qualifiesForReferral(order.subtotal - order.discountTotal)) return;

    const referrer = await db.user.findUnique({ where: { id: referrerId }, select: { email: true } });
    if (!referrer) return;
    const buyerEmail = (order.user?.email ?? order.guestEmail ?? "").trim().toLowerCase();
    if (order.userId === referrerId || (buyerEmail && buyerEmail === referrer.email.trim().toLowerCase())) return;

    const kind = `${REWARD_KIND}${order.orderNumber}`;
    if (await hasMemberCoupon(referrerId, kind)) return;
    const { friends } = await referralProgress(referrerId);
    const value = referralRewardFor(friends + 1);
    await issueMemberCoupon({
      userId: referrerId,
      kind,
      label: `₪${value} מתנה`,
      rule: `חבר מביא חבר — חבר מס' ${friends + 1}`,
      type: "FIXED",
      value,
      days: REFERRAL_REWARD_DAYS,
    });
  } catch (error) {
    console.error("[referral] could not award", orderId, error);
  }
}

/**
 * Tie a friend's account to the account whose link brought it.
 *
 * The owner, 9 November: the friend registers, and the discount belongs to
 * the account — so it works from the phone the link was opened on and from
 * the computer the order is placed on alike. Called right after sign-up and
 * after every sign-in (password, Google, Apple), reading the code the link
 * left in a cookie, or with the code directly when the visitor was already
 * signed in when they clicked it.
 *
 * First link wins, the referrer cannot refer themselves, and an account
 * that has already paid for an order is not a new customer, so it is not
 * tied (the discount is first-order-only anyway). Puts the code on the
 * account's cart, and clears the link's cookies: from here the account
 * carries it. Never throws.
 */
export async function attachReferral(userId: string, code?: string | null): Promise<void> {
  try {
    const jar = await cookies();
    const fromCookie = jar.get(REFERRAL_COOKIE)?.value ?? null;
    const referralCode = (code ?? fromCookie)?.trim().toUpperCase() ?? null;
    if (!referralCode) return;
    const referrerId = await referrerOf(referralCode);
    const clear = () => {
      jar.delete(REFERRAL_COOKIE);
      jar.delete(REFERRAL_FLAG_COOKIE);
    };
    if (!referrerId || referrerId === userId) return clear();

    const user = await db.user.findUnique({ where: { id: userId }, select: { referredById: true } });
    if (!user || user.referredById) return clear();
    const paid = await db.order.count({ where: { userId, paymentStatus: { in: ["CAPTURED", "AUTHORIZED"] } } });
    if (paid > 0) return clear();

    await db.user.update({ where: { id: userId }, data: { referredById: referrerId, referredAt: new Date() } });
    await db.cart.updateMany({ where: { userId, couponCode: null }, data: { couponCode: referralCode } });
    clear();
  } catch (error) {
    console.error("[referral] could not attach", userId, error);
  }
}

/**
 * The friend's discount code for this account's cart, while it is still
 * owed: the account was referred and has not yet paid for an order. Null
 * otherwise. What makes the discount appear on a cart opened on any device.
 */
export async function owedReferralCode(userId: string): Promise<string | null> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { referredById: true } });
  if (!user?.referredById) return null;
  const paid = await db.order.count({ where: { userId, paymentStatus: { in: ["CAPTURED", "AUTHORIZED"] } } });
  if (paid > 0) return null;
  const link = await db.memberCoupon.findFirst({ where: { userId: user.referredById, kind: LINK_KIND }, select: { code: true } });
  return link?.code ?? null;
}
