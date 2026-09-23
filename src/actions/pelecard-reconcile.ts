"use server";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { checkGoodParamX } from "@/lib/pelecard/client";
import { pelecardConfigured } from "@/lib/pelecard/config";

/**
 * ASKING PELECARD WHAT ACTUALLY HAPPENED TO AN ORDER NOBODY HEARD BACK ABOUT.
 *
 * An order sits at PAYMENT_PENDING from the moment it is created until their
 * server-side callback settles it. When that callback never arrives the order
 * stays there for ever, and the one thing it cannot tell us is the only thing
 * that matters: whether the customer's card was charged.
 *
 * That is not hypothetical. A ₪8,579 bit payment showed the customer error 599
 * — Pelecard's own wording for it is "check transaction status manually" — and
 * nothing at all reached our server: no status code, no body, no row. Five
 * earlier attempts sit in the same state. Every one of them is a customer who
 * may have paid a shop that believes they did not.
 *
 * The answer was always available. checkGoodParamX has been in client.ts since
 * the integration was written, with a comment describing it as the safety net
 * for exactly this case, and it had never been called from anywhere. We send
 * the order id as ParamX on every init, so Pelecard can be asked about an order
 * by the name we already gave them.
 *
 * IT REPORTS AND IT DOES NOT SETTLE, and that restraint is deliberate. Marking
 * an order paid from a response whose shape nobody has seen is the same mistake
 * as guessing what a successful validation looks like — and here the cost of
 * being wrong is a shipped order against a payment that never happened. So this
 * hands back what they said, verbatim, and a person decides. Once a real
 * confirmed answer has been read, settling can follow the callback's own path.
 *
 * Admin only: it speaks to the gateway with the shop's credentials, and what it
 * returns is a customer's transaction.
 */

export type ReconcileResult =
  | { ok: true; orderNumber: string; answer: unknown }
  | { ok: false; error: string };

export async function reconcileOrderAction(orderNumber: string): Promise<ReconcileResult> {
  await requireAdmin();

  if (!pelecardConfigured()) {
    return { ok: false, error: "הסליקה אינה מוגדרת — אין למי לפנות" };
  }

  const order = await db.order.findUnique({
    where: { orderNumber },
    select: { id: true, orderNumber: true, paymentMethod: true },
  });
  if (!order) return { ok: false, error: `הזמנה ${orderNumber} לא נמצאה` };

  /* Only an order that actually went to the gateway has a ParamX there to ask
     about. A demo-card order was never sent, so a lookup would come back empty
     and read as "not paid" about an order that was never meant to be. */
  if (order.paymentMethod !== "PELECARD") {
    return { ok: false, error: `הזמנה ${orderNumber} לא נשלחה לפלאקארד (${order.paymentMethod})` };
  }

  try {
    const answer = await checkGoodParamX(order.id);
    console.info("[pelecard] reconcile", { orderNumber: order.orderNumber, answer });
    return { ok: true, orderNumber: order.orderNumber, answer };
  } catch (error) {
    console.error("[pelecard] reconcile threw", { orderNumber: order.orderNumber, error });
    return { ok: false, error: `הפנייה לפלאקארד נכשלה: ${String(error)}` };
  }
}

/**
 * Every order still waiting on a callback, newest first.
 *
 * PAYMENT_PENDING is the state checkout leaves a gateway order in, so this is
 * the queue of orders whose outcome the shop does not know — including the ones
 * where the customer is holding a receipt.
 */
export async function stuckGatewayOrders() {
  await requireAdmin();
  return db.order.findMany({
    where: { paymentMethod: "PELECARD", status: "PAYMENT_PENDING", paymentStatus: "PENDING" },
    select: { orderNumber: true, total: true, createdAt: true, guestName: true },
    orderBy: { createdAt: "desc" },
    take: 25,
  });
}
