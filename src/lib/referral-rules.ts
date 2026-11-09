/**
 * חבר מביא חבר — the rules, with no database, so a script can test them and
 * a client component can print them.
 *
 * The owner's words, 9 November: a customer who brings a friend gets a gift
 * toward purchases — 20 ₪ for the first friend, 50 ₪ for the second and
 * 100 ₪ for the third — and only once the friend has bought for more than
 * 400 ₪. The friend's 5% on the first order is the "5% link" from the same
 * request.
 *
 * Past the third friend the gift stays at 100 ₪: the owner named three
 * steps and no ceiling, and stopping a customer's reward at exactly the
 * point they have proved they bring people would be the wrong lesson.
 */
export const REFERRAL_FRIEND_PERCENT = 5;
/** The friend's order, goods after discount and without delivery. */
export const REFERRAL_MIN_ORDER = 400;
export const REFERRAL_REWARDS: readonly number[] = [20, 50, 100];
/** How long a gift coupon stays usable. */
export const REFERRAL_REWARD_DAYS = 90;

/** The gift for the n-th qualifying friend (1-based). */
export function referralRewardFor(n: number): number {
  if (n < 1) return 0;
  return REFERRAL_REWARDS[Math.min(n, REFERRAL_REWARDS.length) - 1];
}

/** Does a friend's order earn the referrer a gift? */
export function qualifiesForReferral(goodsAfterDiscount: number): boolean {
  return goodsAfterDiscount >= REFERRAL_MIN_ORDER;
}

export const REFERRAL_CODE_PREFIX = "REF-";
export const REFERRAL_COOKIE = "bt_ref";
export const REFERRAL_COOKIE_DAYS = 60;
