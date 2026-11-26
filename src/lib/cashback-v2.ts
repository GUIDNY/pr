import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { DESTRUCTIVE_ORDER_STATUSES } from "@/lib/enums";
import { newMemberCouponCode } from "@/lib/member-coupons";
import {
  CASHBACK_CATEGORY_MULTIPLIER,
  MIN_CASHBACK,
  cashbackKey,
  clawBack,
  earnCashback,
  fallbackReleaseDays,
  issueIfDue,
  orderMultiplier,
  planCashback,
  settlePending,
  type CashbackStore,
  type OrderState,
} from "@/lib/cashback-v2-rules";

/**
 * Cashback v2 over the database: the Prisma side of the store that
 * cashback-v2-rules.ts describes, the call game-levels.ts makes at payment,
 * and the daily settlement the cron runs. Nothing here is reached while
 * CASHBACK_V2_ENABLED is off, so the two tables need not exist until then.
 *
 * Every write that moves the balance is a single transaction holding the
 * ledger row and the balance change, and each is conditional on something
 * the database enforces — the ledger's unique key, or the balance or the
 * coupon still being what was read — never on a value read a moment before.
 */

const prismaCode = (e: unknown) => (e as { code?: string } | null)?.code;

/** A v2 order is marked on MemberCoupon.orderId, the column v1 already uses
    to answer "did this order get its cashback": so whichever version looks at
    the order next — a hold captured days later, or v1 after the flag is
    switched back off — finds it done. The row has no Promotion and is not a
    coupon. */
export const PENDING_MARK_KIND = "cashback-pending";

/** Exported for scripts/check-cashback-v2-db.ts, which walks it against a
    local Postgres; the application reaches it only through the functions below. */
export const cashbackStore: CashbackStore = {
  async append(row, balanceDelta) {
    try {
      const create = db.cashbackLedger.create({ data: row });
      if (balanceDelta === 0) await create;
      else {
        await db.$transaction([
          create,
          db.cashbackAccount.upsert({
            where: { userId: row.userId },
            create: { userId: row.userId, balance: balanceDelta },
            update: { balance: { increment: balanceDelta } },
          }),
        ]);
      }
      return true;
    } catch (e) {
      // the key exists: this step was already taken
      if (prismaCode(e) === "P2002") return false;
      throw e;
    }
  },

  async balance(userId) {
    const account = await db.cashbackAccount.findUnique({ where: { userId }, select: { balance: true } });
    return account?.balance ?? 0;
  },

  async issueCoupon({ userId, expectedBalance, agorot, valueNis, minCart, days }) {
    let code = newMemberCouponCode();
    for (let i = 0; i < 5 && (await db.promotion.findUnique({ where: { code } })); i++) code = newMemberCouponCode();
    const now = new Date();
    try {
      await db.$transaction([
        // refuses (P2025) unless the balance is still the one the amount was worked out from
        db.cashbackAccount.update({
          where: { userId, balance: expectedBalance },
          data: { balance: { decrement: agorot } },
        }),
        db.memberCoupon.create({ data: { code, userId, kind: "cashback" } }),
        db.promotion.create({
          data: {
            name: `מועדון BuyToday · ₪${valueNis} קאשבק · קאשבק שנצבר מהזמנות`,
            code,
            type: "FIXED",
            value: valueNis,
            scope: "CART",
            minCartAmount: minCart || null,
            startsAt: now,
            endsAt: new Date(now.getTime() + days * 86_400_000),
            isActive: true,
            membersOnly: true,
          },
        }),
        db.cashbackLedger.create({
          data: { key: cashbackKey.issue(code), userId, type: "ISSUE", amount: -agorot, couponCode: code },
        }),
      ]);
      return code;
    } catch (e) {
      if (prismaCode(e) === "P2025") return null;
      throw e;
    }
  },

  async reclaimCoupon(userId) {
    const issued = await db.cashbackLedger.findMany({
      where: { userId, type: "ISSUE", couponCode: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { couponCode: true, amount: true },
    });
    const now = new Date();
    for (const row of issued) {
      const code = row.couponCode!;
      const promo = await db.promotion.findUnique({ where: { code }, select: { isActive: true, endsAt: true } });
      if (!promo?.isActive || (promo.endsAt && promo.endsAt <= now)) continue;
      /* A code sitting on an order that is on its way to being paid is not
         unused: retireGameCoupon only switches it off when the payment lands. */
      const inUse = await db.order.count({
        where: { couponCode: code, status: { notIn: DESTRUCTIVE_ORDER_STATUSES }, paymentStatus: { not: "FAILED" } },
      });
      if (inUse) continue;
      try {
        await db.$transaction([
          // refuses (P2025) if the coupon was used or taken back in the meantime
          db.promotion.update({ where: { code, isActive: true }, data: { isActive: false } }),
          db.cashbackLedger.create({
            data: { key: cashbackKey.couponVoid(code), userId, type: "COUPON_VOID", amount: -row.amount, couponCode: code },
          }),
          db.cashbackAccount.update({ where: { userId }, data: { balance: { increment: -row.amount } } }),
        ]);
        return -row.amount;
      } catch (e) {
        if (prismaCode(e) === "P2025" || prismaCode(e) === "P2002") continue;
        throw e;
      }
    }
    return null;
  },
};
const store = cashbackStore;

/** The order's category multiplier; no query at all while the table is empty. */
async function multiplierFor(orderId: string): Promise<number> {
  if (Object.keys(CASHBACK_CATEGORY_MULTIPLIER).length === 0) return 1;
  const items = await db.orderItem.findMany({
    where: { orderId },
    select: {
      priceSnap: true,
      quantity: true,
      product: { select: { category: { select: { slug: true, parent: { select: { slug: true } } } } } },
    },
  });
  return orderMultiplier(
    items.map((i) => ({
      amount: i.priceSnap * i.quantity,
      categorySlugs: [i.product.category.slug, i.product.category.parent?.slug],
    })),
  );
}

/**
 * Called by awardPurchase, for a member's paid order, instead of issuing the
 * v1 coupon. Safe to call any number of times for the same order.
 */
export async function recordPendingCashback(
  order: { id: string; userId: string; total: number; orderNumber: string },
  rate: number,
): Promise<void> {
  const plan = planCashback(order.total, rate, true, await multiplierFor(order.id));
  if (plan.mode !== "v2-pending") return;
  await earnCashback(store, order, plan.agorot, `${rate}% מהזמנה ${order.orderNumber}`);
  await db.memberCoupon
    .create({ data: { code: `CBV2-${order.id}`, userId: order.userId, kind: PENDING_MARK_KIND, orderId: order.id } })
    .catch(() => {});
}

type SettleRow = {
  orderId: string;
  userId: string;
  amount: number;
  earnedAt?: Date | null;
  missing: boolean;
  status: string | null;
  paymentStatus: string | null;
  deliveredAt: Date | null;
};

const stateOf = (r: SettleRow): OrderState =>
  r.missing || !r.status || !r.paymentStatus
    ? null
    : { status: r.status, paymentStatus: r.paymentStatus, deliveredAt: r.deliveredAt };

/**
 * The daily pass (/api/internal/cashback-release). It reads what each order
 * IS today rather than being told what happened to it, so no order action
 * had to learn about cashback and an undo, a manual status change or a
 * missed call cannot leave the two out of step:
 *
 *   pending + cancelled / refunded / deleted            -> VOID
 *   pending + DELIVERED for CASHBACK_RELEASE_DAYS       -> RELEASE (+ coupon when the balance reaches the minimum)
 *   pending + paid, never given a delivery time, for
 *             CASHBACK_FALLBACK_RELEASE_DAYS since payment -> RELEASE, so a credit is not stuck for ever
 *   released + cancelled / refunded afterwards          -> CLAWBACK
 *
 * "Delivered" is Order.deliveredAt, which closeOrderAction writes. The older
 * admin status menu (updateOrderStatusAction) can set DELIVERED without it,
 * so the time of the last DELIVERED step in the status history stands in.
 */
export async function runCashbackSettlement(now: Date = new Date(), limit = 500) {
  const reversed = Prisma.join(DESTRUCTIVE_ORDER_STATUSES as string[]);
  const result = { released: 0, voided: 0, waiting: 0, clawed: 0, issued: 0, errors: 0 };
  const fallbackDays = fallbackReleaseDays();
  /* Credits recorded before this moment are old enough for the fallback. With
     it switched off the date is one no row is older than. */
  const fallbackBefore = new Date(fallbackDays == null ? 0 : now.getTime() - fallbackDays * 86_400_000);

  /* Pending credits whose order can have something to say: not the ones
     still on their way to the customer, which would otherwise fill the batch. */
  const pending = await db.$queryRaw<SettleRow[]>`
    SELECT e."orderId", e."userId", e."amount", e."createdAt" AS "earnedAt",
           (o."id" IS NULL) AS "missing", o."status", o."paymentStatus",
           COALESCE(o."deliveredAt", (
             SELECT max(h."createdAt") FROM "OrderStatusHistory" h
             WHERE h."orderId" = o."id" AND h."toStatus" = 'DELIVERED'
           )) AS "deliveredAt"
    FROM "CashbackLedger" e
    LEFT JOIN "Order" o ON o."id" = e."orderId"
    WHERE e."type" = 'EARN' AND e."orderId" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "CashbackLedger" s WHERE s."key" = 'settle:' || e."orderId")
      AND (o."id" IS NULL OR o."status" = 'DELIVERED' OR o."status" IN (${reversed})
           OR o."paymentStatus" NOT IN ('CAPTURED', 'AUTHORIZED')
           OR e."createdAt" <= ${fallbackBefore})
    ORDER BY e."createdAt" ASC
    LIMIT ${limit}`;
  for (const row of pending) {
    try {
      const outcome = await settlePending(store, row, stateOf(row), now, fallbackDays);
      if (outcome === "released") result.released++;
      else if (outcome === "voided") result.voided++;
      else if (outcome === "waiting") result.waiting++;
    } catch (error) {
      result.errors++;
      console.error("[cashback] could not settle", row.orderId, error);
    }
  }

  const refundedLater = await db.$queryRaw<SettleRow[]>`
    SELECT r."orderId", r."userId", r."amount", (o."id" IS NULL) AS "missing", o."status", o."paymentStatus",
           o."deliveredAt"
    FROM "CashbackLedger" r
    LEFT JOIN "Order" o ON o."id" = r."orderId"
    WHERE r."type" = 'RELEASE' AND r."orderId" IS NOT NULL
      AND (o."id" IS NULL OR o."status" IN (${reversed}) OR o."paymentStatus" NOT IN ('CAPTURED', 'AUTHORIZED'))
      AND NOT EXISTS (SELECT 1 FROM "CashbackLedger" c WHERE c."key" = 'clawback:' || r."orderId")
    ORDER BY r."createdAt" ASC
    LIMIT ${limit}`;
  for (const row of refundedLater) {
    try {
      if ((await clawBack(store, row, stateOf(row))) === "clawed") result.clawed++;
    } catch (error) {
      result.errors++;
      console.error("[cashback] could not claw back", row.orderId, error);
    }
  }

  /* A balance at or over the minimum with no coupon yet: a release that lost
     its race to another, or a run that stopped between the two steps. */
  const due = await db.cashbackAccount.findMany({
    where: { balance: { gte: MIN_CASHBACK * 100 } },
    select: { userId: true },
    take: limit,
  });
  for (const { userId } of due) {
    try {
      if (await issueIfDue(store, userId)) result.issued++;
    } catch (error) {
      result.errors++;
      console.error("[cashback] could not issue", userId, error);
    }
  }
  return result;
}

/** For the account pages: what can be used, and what is still waiting. Agorot. */
export async function cashbackSummary(userId: string): Promise<{ balance: number; pending: number }> {
  const [balance, rows] = await Promise.all([
    store.balance(userId),
    db.$queryRaw<{ pending: bigint | null }[]>`
      SELECT sum(e."amount") AS "pending"
      FROM "CashbackLedger" e
      WHERE e."userId" = ${userId} AND e."type" = 'EARN'
        AND NOT EXISTS (SELECT 1 FROM "CashbackLedger" s WHERE s."key" = 'settle:' || e."orderId")`,
  ]);
  return { balance, pending: Number(rows[0]?.pending ?? 0) };
}
