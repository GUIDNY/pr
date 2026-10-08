import "server-only";
import { db } from "@/lib/db";
import { afterOrderPaid } from "@/lib/order-paid";
import { customerHasPaid } from "@/lib/order-signal";
import type { WalletEntryKind } from "@/lib/enums";

/**
 * THE BUYTODAY BALANCE (ארנק / יתרה לקניות).
 *
 * A signed-in customer pays the shop by card for one of three fixed packages
 * and gets a little more than they paid as a balance, which they then spend
 * on orders here instead of entering a card. It is shekels, and it buys
 * products in this shop and nothing else.
 *
 * IT IS NOT THE GAME'S COINS, and the two must never meet. The 3D mall's
 * wheel pays coins that buy clothes for a figure and have no money value by
 * design — game-wheel.ts explains why that is the line between a free game
 * and an unlicensed lottery. Nothing may convert coins to balance or balance
 * to coins, and nothing on the wheel may pay balance.
 *
 * HOW THE MONEY IS KEPT. A ledger (WalletEntry), never a balance column: the
 * balance is the sum of the rows, a row is never edited or deleted, and a
 * mistake is put right with an ADJUST row that says who and why. Integer
 * agorot, signed. Every write that can move a customer's balance takes a row
 * lock on that customer's User row first, so two of them for the same person
 * run one after the other — that is what makes "check the balance, then
 * spend it" safe against two tabs paying at once. The unique keys on
 * (topupId, kind) and (orderId, kind) make each credit, spend and refund
 * happen once whatever is retried or redelivered.
 *
 * It ships dark. Nothing reads these tables until WALLET_ENABLED is set
 * (see walletEnabled), and the tables themselves come from
 * docs/wallet-ddl.sql, which the owner runs once.
 *
 * ─── LEGAL AND ACCOUNTING — TO BE CHECKED BEFORE THIS IS SWITCHED ON ───
 *
 * This is closed-loop store credit sold for money: a prepaid balance usable
 * only with this shop. Israeli consumer-protection rules on prepaid credit
 * and gift vouchers (תווי שי / שוברים) very likely apply to it, and nothing
 * here has been reviewed by a lawyer. In particular, before launch someone
 * qualified has to confirm:
 *
 *   - VALIDITY. The rules on gift vouchers are understood to require a
 *     validity of at least five years and to restrict expiry. This code
 *     never expires a balance at all, which is the safe direction; if an
 *     expiry is ever added it has to be checked first.
 *   - REFUNDS / CASHING OUT. Whether, when and how a customer may get unused
 *     balance back in money (cancellation of a distance sale, closing the
 *     account, the bonus part versus the paid part). There is no cash-out
 *     here; a refund of a top-up is done by hand at Pelecard, followed by a
 *     negative ADJUST — adjustWallet() below.
 *   - DISCLOSURE. The terms of the balance (what it buys, validity, refund
 *     rules) belong in the site's תקנון, which does not mention it yet.
 *   - VAT AND REVENUE. When the top-up is revenue (on payment, or on spend),
 *     how the bonus is treated (a discount on future purchases?), and what
 *     the receipt for a top-up is — all for the accountant. Today the order
 *     paid from balance is recorded with its full total, like a card order.
 *   - Holding customers' prepaid money may carry other obligations as well.
 *
 * None of the above is settled law as written here; it is the list of
 * questions, not the answers.
 */

/** Off unless WALLET_ENABLED is "true" or "1". Any other value, or none, is off. */
export function walletEnabled(): boolean {
  const raw = process.env.WALLET_ENABLED?.trim().toLowerCase();
  return raw === "true" || raw === "1";
}

export type WalletPackage = { id: string; paidAgorot: number; creditAgorot: number };

/**
 * The only amounts a balance can be bought in. Fixed in code, chosen by id:
 * a browser names a package, never a price, so it cannot name ₪1 → ₪5,200.
 */
export const WALLET_PACKAGES: readonly WalletPackage[] = [
  { id: "p500", paidAgorot: 50_000, creditAgorot: 52_000 },
  { id: "p1000", paidAgorot: 100_000, creditAgorot: 105_000 },
  { id: "p5000", paidAgorot: 500_000, creditAgorot: 520_000 },
] as const;

export function walletPackage(id: unknown): WalletPackage | null {
  return WALLET_PACKAGES.find((p) => p.id === id) ?? null;
}

/** Agorot → shekels, for display only. Money is never computed in shekels here. */
export const agorotToShekels = (agorot: number) => agorot / 100;

/**
 * Shekels as the orders store them (a float) → agorot. Rounded, because
 * 149.90 * 100 is not 14990 in binary; the same conversion toAgorot() in
 * pelecard/config makes, without its throw on zero.
 */
export const shekelsToAgorot = (shekels: number) => Math.round(shekels * 100);

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

/**
 * Serialises every balance-moving write for one customer. Held until the
 * transaction ends. Everything after it in the same transaction must use
 * `tx`, never `db`: the pool has one connection (lib/db.ts), and this
 * transaction is holding it.
 */
async function lockCustomer(tx: Tx, userId: string) {
  await tx.$queryRawUnsafe(`SELECT "id" FROM "User" WHERE "id" = $1 FOR UPDATE`, userId);
}

async function balanceIn(tx: Tx | typeof db, userId: string): Promise<number> {
  const agg = await tx.walletEntry.aggregate({ where: { userId }, _sum: { amountAgorot: true } });
  return agg._sum.amountAgorot ?? 0;
}

/** The customer's balance, in agorot. */
export async function walletBalanceAgorot(userId: string): Promise<number> {
  return balanceIn(db, userId);
}

/** The ledger, newest first, with the order number where a row has one. */
export async function walletHistory(userId: string, take = 50) {
  return db.walletEntry.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      amountAgorot: true,
      kind: true,
      note: true,
      createdAt: true,
      order: { select: { orderNumber: true } },
    },
  });
}

/**
 * Credits a top-up that Pelecard has confirmed: PAID, plus a TOPUP row for
 * what was paid and a BONUS row for the rest. Called only by the wallet
 * callback after its checks. Exactly once — a second call, or a redelivered
 * notification racing the first, finds the top-up already PAID under the
 * lock and does nothing.
 */
export async function creditTopup(
  topupId: string,
  record: {
    environment: string;
    pelecardTransactionId: string | null;
    pelecardStatusCode: string | null;
    approvalNo: string | null;
    cardLast4: string | null;
    rawResponse: object;
  },
): Promise<{ credited: boolean }> {
  return db.$transaction(async (tx) => {
    const topup = await tx.walletTopup.findUnique({ where: { id: topupId } });
    if (!topup) throw new Error(`unknown top-up ${topupId}`);
    await lockCustomer(tx, topup.userId);

    // Re-read under the lock: the first read may predate a concurrent credit.
    const fresh = await tx.walletTopup.findUniqueOrThrow({ where: { id: topupId } });
    if (fresh.status === "PAID") return { credited: false };

    await tx.walletTopup.update({
      where: { id: topupId },
      data: { status: "PAID", paidAt: new Date(), ...record },
    });
    await tx.walletEntry.create({
      data: { userId: topup.userId, kind: "TOPUP", amountAgorot: topup.paidAgorot, topupId, note: `טעינה בכרטיס · אישור ${record.approvalNo ?? "—"}` },
    });
    const bonus = topup.creditAgorot - topup.paidAgorot;
    if (bonus > 0) {
      await tx.walletEntry.create({
        data: { userId: topup.userId, kind: "BONUS", amountAgorot: bonus, topupId, note: `בונוס על חבילת ₪${topup.paidAgorot / 100}` },
      });
    }
    return { credited: true };
  });
}

export type WalletPayResult = { ok: true } | { ok: false; error: string };

/**
 * Pays an existing, unpaid order in full from the customer's balance.
 *
 * One transaction: lock the customer, re-check the order and the balance
 * under the lock, write the SPEND row, a Payment row (provider WALLET) and
 * the order's paid status and history — the same fields the Pelecard
 * callback writes for a captured card payment. Then, outside it,
 * afterOrderPaid(), the same function the callback calls, so coupons,
 * cashback, the address book and both mails happen identically.
 *
 * Full coverage only. Part balance and part card is not built.
 *
 * On a refusal the order is left marked PAYMENT_FAILED, so it reads in the
 * back office as an order nobody paid for rather than one still waiting.
 */
export async function payOrderFromWallet(orderId: string, userId: string): Promise<WalletPayResult> {
  if (!walletEnabled()) return { ok: false, error: "התשלום מהיתרה אינו זמין כרגע." };

  type Paid = { id: string; userId: string | null; couponCode: string | null; deliveryMethod: string };
  let outcome: { paid: Paid } | { refusal: string };

  try {
    outcome = await db.$transaction(async (tx) => {
      await lockCustomer(tx, userId);

      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { id: true, orderNumber: true, userId: true, status: true, paymentStatus: true, total: true, couponCode: true, deliveryMethod: true },
      });
      if (!order || order.userId !== userId) return { refusal: "ההזמנה לא נמצאה." };
      if (customerHasPaid(order.paymentStatus)) return { refusal: "ההזמנה כבר שולמה." };

      const amount = shekelsToAgorot(order.total);
      if (amount <= 0) return { refusal: "סכום ההזמנה אינו תקין." };
      const balance = await balanceIn(tx, userId);
      if (balance < amount) {
        return { refusal: `היתרה (₪${(balance / 100).toLocaleString("he-IL")}) אינה מכסה את ההזמנה.` };
      }

      // The unique (orderId, kind) key is the second guard: a SPEND for this
      // order that somehow got past the checks above fails here, and the
      // whole transaction with it.
      await tx.walletEntry.create({
        data: { userId, kind: "SPEND", amountAgorot: -amount, orderId: order.id, note: `הזמנה ${order.orderNumber}` },
      });
      await tx.payment.create({
        data: {
          orderId: order.id,
          provider: "WALLET",
          amount: order.total,
          amountAgorot: amount,
          status: "CAPTURED",
          capturedAt: new Date(),
          reference: `WALLET-${order.orderNumber}`,
        },
      });
      // Conditional on still being unpaid, so nothing else can have paid it
      // between the read above and this write.
      const moved = await tx.order.updateMany({
        where: { id: order.id, paymentStatus: { notIn: ["CAPTURED", "AUTHORIZED"] } },
        data: { paymentStatus: "CAPTURED", paymentMethod: "WALLET", status: "PAID" },
      });
      if (moved.count !== 1) throw new Error("order changed while paying from balance");
      await tx.orderStatusHistory.create({
        data: { orderId: order.id, fromStatus: order.status, toStatus: "PAID", note: `תשלום מיתרת BuyToday · ₪${(amount / 100).toLocaleString("he-IL")}` },
      });

      return { paid: { id: order.id, userId: order.userId, couponCode: order.couponCode, deliveryMethod: order.deliveryMethod } };
    });
  } catch (error) {
    console.error("[wallet] payment failed", { orderId, error });
    outcome = { refusal: "התשלום מהיתרה לא הושלם. לא חויבתם — אפשר לנסות שוב או לשלם בכרטיס." };
  }

  if ("refusal" in outcome) {
    const refusal = outcome.refusal;
    await db
      .$transaction([
        db.order.updateMany({
          where: { id: orderId, paymentStatus: "PENDING" },
          data: { paymentStatus: "FAILED", status: "PAYMENT_FAILED" },
        }),
        db.orderStatusHistory.create({
          data: { orderId, toStatus: "PAYMENT_FAILED", note: `תשלום מהיתרה נדחה · ${refusal}` },
        }),
      ])
      .catch((error) => console.error("[wallet] could not mark the order failed", { orderId, error }));
    return { ok: false, error: refusal };
  }

  await afterOrderPaid(outcome.paid);
  return { ok: true };
}

/**
 * Gives the balance back for an order that was paid from it and has been
 * cancelled or refunded in the back office. The REFUND row equals the SPEND
 * row, once per order (unique key). Returns the agorot credited, or 0 when
 * there was nothing to give back — not a balance order, or already refunded.
 *
 * Called from updateOrderStatusAction. Callable on its own for an order that
 * was closed some other way.
 */
export async function refundOrderToWallet(orderId: string, actorId: string | null): Promise<number> {
  return db.$transaction(async (tx) => {
    const spend = await tx.walletEntry.findUnique({ where: { orderId_kind: { orderId, kind: "SPEND" } } });
    if (!spend) return 0;
    await lockCustomer(tx, spend.userId);
    const already = await tx.walletEntry.findUnique({ where: { orderId_kind: { orderId, kind: "REFUND" } } });
    if (already) return 0;
    const order = await tx.order.findUnique({ where: { id: orderId }, select: { orderNumber: true } });
    await tx.walletEntry.create({
      data: {
        userId: spend.userId,
        kind: "REFUND",
        amountAgorot: -spend.amountAgorot,
        orderId,
        createdById: actorId,
        note: `זיכוי הזמנה ${order?.orderNumber ?? ""}`.trim(),
      },
    });
    return -spend.amountAgorot;
  });
}

/** Whether an order's balance payment has already been given back. */
export async function walletRefundExists(orderId: string): Promise<boolean> {
  return Boolean(await db.walletEntry.findUnique({ where: { orderId_kind: { orderId, kind: "REFUND" } }, select: { id: true } }));
}

/**
 * A manual correction by the back office, positive or negative, with the
 * reason recorded. Refuses to take a balance below zero. This is also how a
 * top-up refunded by hand at Pelecard is taken back out of the balance.
 */
export async function adjustWallet(p: {
  userId: string;
  amountAgorot: number;
  note: string;
  actorId: string;
}): Promise<{ ok: true; balance: number } | { ok: false; error: string }> {
  if (!Number.isInteger(p.amountAgorot) || p.amountAgorot === 0) return { ok: false, error: "סכום לא תקין" };
  if (!p.note.trim()) return { ok: false, error: "יש לכתוב סיבה" };
  return db.$transaction(async (tx) => {
    await lockCustomer(tx, p.userId);
    const balance = await balanceIn(tx, p.userId);
    if (balance + p.amountAgorot < 0) return { ok: false as const, error: "העדכון יוריד את היתרה מתחת לאפס" };
    await tx.walletEntry.create({
      data: { userId: p.userId, kind: "ADJUST" satisfies WalletEntryKind, amountAgorot: p.amountAgorot, note: p.note.trim(), createdById: p.actorId },
    });
    return { ok: true as const, balance: balance + p.amountAgorot };
  });
}
