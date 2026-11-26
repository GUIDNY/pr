import "server-only";
import { db } from "@/lib/db";
import { DESTRUCTIVE_ORDER_STATUSES } from "@/lib/enums";
import { hasMemberCoupon, issueMemberCoupon } from "@/lib/member-coupons";
import { awardReferral } from "@/lib/referral";
import { CASHBACK_DAYS, cashbackV2Enabled, planCashback } from "@/lib/cashback-v2-rules";
import { recordPendingCashback, recordPendingGift } from "@/lib/cashback-v2";
import { GIFT_DAYS, LEVEL_SPEND, TIERS, levelFor, type Tier } from "@/lib/club-tiers";

/**
 * The BuyToday club in the 3D mall: levels that come from purchases, and
 * only from them, and real benefits for each level — cashback on every paid
 * order and a one-time gift on reaching some levels.
 *
 * All of it is counted here from the orders table, so a level is a fact
 * about the account and not something the game reports about itself. Paid
 * means captured or authorised (as customerHasPaid), and an order that was
 * cancelled or refunded does not count. Nothing about it depends on chance:
 * a benefit that follows from a purchase is a loyalty programme, not a
 * lottery (see game-wheel.ts for why that line matters).
 */
export { TIERS, LEVEL_SPEND, GIFT_DAYS, type Tier };
export { CASHBACK_DAYS };

const PAID = { paymentStatus: { in: ["CAPTURED", "AUTHORIZED"] }, status: { notIn: DESTRUCTIVE_ORDER_STATUSES } };

export async function purchaseLevel(userId: string) {
  const agg = await db.order.aggregate({ where: { userId, ...PAID }, _sum: { total: true }, _count: { _all: true } });
  const spent = Math.round(agg._sum.total ?? 0);
  const level = levelFor(spent);
  return { orders: agg._count._all, spent, level, cashback: TIERS[level - 1].cashback, thresholds: LEVEL_SPEND, tiers: TIERS };
}

/**
 * A paid order's club benefits: cashback at the rate of the level the order
 * brings the customer to, as a personal credit for the next purchase, and
 * the gift of every gift level the order crosses. Once per order (the
 * orderId is unique on MemberCoupon) and once per gift. Never throws: a
 * benefit is a courtesy, the payment record is not.
 */
export async function awardPurchase(orderId: string): Promise<void> {
  /* חבר מביא חבר first and on its own: the buyer may be a guest, and the
     gift goes to whoever sent them, not to the buyer. */
  await awardReferral(orderId);
  try {
    const order = await db.order.findUnique({ where: { id: orderId }, select: { id: true, userId: true, total: true, orderNumber: true } });
    if (!order?.userId) return;
    if (await db.memberCoupon.findUnique({ where: { orderId } })) return;
    const { spent } = await purchaseLevel(order.userId);
    const after = levelFor(spent), before = levelFor(Math.max(0, spent - Math.round(order.total)));
    const rate = TIERS[after - 1].cashback;
    /* CASHBACK_V2_ENABLED (off unless set to "true"): the credit is recorded
       as pending and accumulates instead of becoming a coupon now — see
       cashback-v2-rules.ts. Off, this is what it has always been: a coupon
       at once, and nothing under MIN_CASHBACK. */
    if (cashbackV2Enabled()) {
      await recordPendingCashback({ ...order, userId: order.userId }, rate);
    } else {
      const plan = planCashback(order.total, rate, false);
      if (plan.mode === "v1-coupon") {
        await issueMemberCoupon({
          userId: order.userId, kind: "cashback", orderId: order.id,
          label: `₪${plan.credit} קאשבק`, rule: `${rate}% מהזמנה ${order.orderNumber}`,
          type: "FIXED", value: plan.credit, days: CASHBACK_DAYS,
        });
      }
    }
    for (const t of TIERS) {
      if (!t.gift || t.level <= before || t.level > after) continue;
      /* v2: the gift waits out the same pending period as the cashback of the
         order that earned it, and is lost with it if that order is cancelled
         or returned first — see settleGift in cashback-v2-rules.ts. */
      if (cashbackV2Enabled()) {
        await recordPendingGift({ id: order.id, userId: order.userId }, t.level);
        continue;
      }
      const kind = `level${t.level}`;
      if (await hasMemberCoupon(order.userId, kind)) continue;
      await issueMemberCoupon({
        userId: order.userId, kind, label: `₪${t.gift.value} מתנה`, rule: `מתנת רמה ${t.level}`,
        type: "FIXED", value: t.gift.value, min: t.gift.min, days: GIFT_DAYS,
      });
    }
  } catch (error) {
    console.error("[club] could not award purchase", orderId, error);
  }
}
