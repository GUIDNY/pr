import "server-only";
import { db } from "@/lib/db";
import { DESTRUCTIVE_ORDER_STATUSES } from "@/lib/enums";
import { hasMemberCoupon, issueMemberCoupon } from "@/lib/member-coupons";

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
export type Tier = { level: number; spend: number; cashback: number; gift?: { value: number; min: number } };

export const TIERS: Tier[] = [
  { level: 1, spend: 0, cashback: 0 },
  { level: 2, spend: 1, cashback: 1 },
  { level: 3, spend: 500, cashback: 1.5, gift: { value: 20, min: 200 } },
  { level: 4, spend: 1000, cashback: 2 },
  { level: 5, spend: 2000, cashback: 2.5, gift: { value: 50, min: 400 } },
  { level: 6, spend: 3500, cashback: 3 },
  { level: 7, spend: 5000, cashback: 3.5, gift: { value: 100, min: 700 } },
  { level: 8, spend: 8000, cashback: 4 },
  { level: 9, spend: 12000, cashback: 4.5 },
  { level: 10, spend: 20000, cashback: 5, gift: { value: 250, min: 1500 } },
];
export const LEVEL_SPEND = TIERS.map((t) => t.spend);
export const CASHBACK_DAYS = 90;
export const GIFT_DAYS = 30;
const MIN_CASHBACK = 5;

const levelFor = (spent: number) => [...TIERS].reverse().find((t) => spent >= t.spend && (t.spend > 0 || spent === 0 || t.level === 1))!.level;

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
  try {
    const order = await db.order.findUnique({ where: { id: orderId }, select: { id: true, userId: true, total: true, orderNumber: true } });
    if (!order?.userId) return;
    if (await db.memberCoupon.findUnique({ where: { orderId } })) return;
    const { spent } = await purchaseLevel(order.userId);
    const after = levelFor(spent), before = levelFor(Math.max(0, spent - Math.round(order.total)));
    const rate = TIERS[after - 1].cashback;
    const credit = Math.floor((order.total * rate) / 100);
    if (credit >= MIN_CASHBACK) {
      await issueMemberCoupon({
        userId: order.userId, kind: "cashback", orderId: order.id,
        label: `₪${credit} קאשבק`, rule: `${rate}% מהזמנה ${order.orderNumber}`,
        type: "FIXED", value: credit, days: CASHBACK_DAYS,
      });
    }
    for (const t of TIERS) {
      if (!t.gift || t.level <= before || t.level > after) continue;
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
