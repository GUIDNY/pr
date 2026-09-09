"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireBackOffice } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { completeDebitByUid } from "@/lib/pelecard/client";

/**
 * The two buttons on a salesperson's order card.
 *
 * Both are deliberately narrow. They take an order number rather than an id
 * and each moves exactly one order one step, because the person using them is
 * working through a queue and the failure worth designing against is the one
 * where a tired click at 6pm does something that cannot be undone.
 */

type Result = { success: boolean; error: string | null; note?: string };

/**
 * "אשר תשלום" — approve the order for fulfilment, and collect the money if it
 * is being held.
 *
 * One button, two jobs, and which one it does depends on how the payment was
 * taken:
 *
 *   Held (AUTHORIZED, the J5 lane): the card is charged first. If that fails
 *   nothing else happens — the order stays exactly where it was. Approving an
 *   order whose capture failed would be the whole point of the feature
 *   inverted: goods out, no money.
 *
 *   Already charged (CAPTURED, which is every order today): there is nothing
 *   to collect and the approval is the human check the shop wanted — someone
 *   looked at this order and it is good to send.
 *
 * Not payable at all — failed, refunded, never opened — is refused rather
 * than approved with a warning. A queue where the red ones can be waved
 * through is a queue where the red ones get waved through.
 */
export async function approveOrderAction(orderNumber: string): Promise<Result> {
  const session = await requireBackOffice();
  const order = await db.order.findUnique({
    where: { orderNumber },
    include: { payments: { orderBy: { createdAt: "desc" } } },
  });
  if (!order) return { success: false, error: "הזמנה לא נמצאה" };

  if (order.paymentStatus === "FAILED" || order.paymentStatus === "REFUNDED") {
    return { success: false, error: "אין תשלום להזמנה הזאת. אי אפשר לאשר אותה." };
  }
  if (order.paymentStatus === "PENDING") {
    return { success: false, error: "עוד לא נפתח תשלום להזמנה הזאת." };
  }

  let note = "אושר לטיפול";

  if (order.paymentStatus === "AUTHORIZED") {
    const hold = order.payments.find((p) => p.status === "AUTHORIZED");
    if (!hold?.authorizationUid) {
      return {
        success: false,
        error: "אין מזהה תפיסה (UID) לגבייה. צריך לבדוק את התפיסה מול פלאקארד לפני שגובים.",
      };
    }
    /* The order's total is what we are collecting and the hold is the
       ceiling. They are the same number in the ordinary case; they differ
       exactly when somebody edited the order after the card was held, and
       that is the case this refuses — a charge above the hold is not a
       bigger sale, it is a chargeback. The fix is a new payment, not a
       bigger capture. */
    const captured = await completeDebitByUid({
      uid: hold.authorizationUid,
      totalAgorot: Math.round(order.total * 100),
      heldAgorot: hold.amountAgorot ?? Math.round(hold.amount * 100),
    });
    if (!captured.ok) return { success: false, error: captured.error };

    await db.$transaction([
      db.order.update({ where: { id: order.id }, data: { paymentStatus: "CAPTURED" } }),
      db.payment.update({
        where: { id: hold.id },
        data: { status: "CAPTURED", capturedAt: new Date() },
      }),
    ]);
    note = "הדפוזיט נגבה ואושר לטיפול";
  }

  // PROCESSING and not PAID: PAID is what the gateway says, and overwriting it
  // from here would lose the distinction between "the money arrived" and "a
  // person looked at this". The history row below records who.
  await db.order.update({ where: { id: order.id }, data: { status: "PROCESSING" } });
  await db.orderStatusHistory.create({
    data: {
      orderId: order.id,
      fromStatus: order.status,
      toStatus: "PROCESSING",
      changedById: session.sub,
      note,
    },
  });
  await logAudit({
    actorId: session.sub,
    action: "ORDER_APPROVED",
    entityType: "Order",
    entityId: order.id,
    metadata: { from: order.status, paymentStatus: order.paymentStatus },
  });

  revalidateSellerViews(orderNumber);
  return { success: true, error: null, note };
}

/**
 * "סגור הזמנה" — the order is done and leaves the queue for the closed tab.
 *
 * Refused while the money is still held. A closed order is one nobody is
 * coming back to, and closing one whose deposit was never collected is how a
 * sale is completed for free — the goods have gone and the only thing that
 * would ever have taken the payment is the button that is now out of reach.
 */
export async function closeOrderAction(orderNumber: string): Promise<Result> {
  const session = await requireBackOffice();
  const order = await db.order.findUnique({ where: { orderNumber } });
  if (!order) return { success: false, error: "הזמנה לא נמצאה" };

  if (order.paymentStatus === "AUTHORIZED") {
    return {
      success: false,
      error: "ההזמנה עדיין בדפוזיט. צריך לאשר את התשלום לפני שסוגרים אותה.",
    };
  }

  await db.order.update({ where: { id: order.id }, data: { status: "DELIVERED" } });
  await db.orderStatusHistory.create({
    data: {
      orderId: order.id,
      fromStatus: order.status,
      toStatus: "DELIVERED",
      changedById: session.sub,
      note: "ההזמנה נסגרה",
    },
  });
  await logAudit({
    actorId: session.sub,
    action: "ORDER_CLOSED",
    entityType: "Order",
    entityId: order.id,
    metadata: { from: order.status },
  });

  revalidateSellerViews(orderNumber);
  return { success: true, error: null };
}

function revalidateSellerViews(orderNumber: string) {
  revalidatePath("/admin/orders");
  revalidatePath("/admin/orders/closed");
  revalidatePath(`/admin/orders/${orderNumber}`);
  revalidatePath("/admin");
}
