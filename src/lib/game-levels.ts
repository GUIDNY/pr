import "server-only";
import { db } from "@/lib/db";
import { DESTRUCTIVE_ORDER_STATUSES } from "@/lib/enums";

/**
 * The 3D mall's levels come from purchases, and only from them: what a
 * customer has actually paid for on the shop. Counted here from the orders
 * table, so a level is a fact about the account and not something the game
 * reports about itself; nothing a player does in the game moves it.
 *
 * Paid means the payment is captured or authorised (the same test as
 * customerHasPaid), and an order that was cancelled or refunded does not
 * count. Thresholds are total shekels paid; level 2 is the first purchase.
 */
export const LEVEL_SPEND = [0, 1, 500, 1000, 2000, 3500, 5000, 8000, 12000, 20000];

export async function purchaseLevel(userId: string) {
  const agg = await db.order.aggregate({
    where: {
      userId,
      paymentStatus: { in: ["CAPTURED", "AUTHORIZED"] },
      status: { notIn: DESTRUCTIVE_ORDER_STATUSES },
    },
    _sum: { total: true },
    _count: { _all: true },
  });
  const spent = Math.round(agg._sum.total ?? 0);
  let level = 1;
  LEVEL_SPEND.forEach((t, i) => {
    if (spent >= t && (i === 0 || spent > 0)) level = i + 1;
  });
  return { orders: agg._count._all, spent, level, thresholds: LEVEL_SPEND };
}
