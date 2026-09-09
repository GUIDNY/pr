"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireBackOffice } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { completeDebitByUid } from "@/lib/pelecard/client";
import { notifyOrder } from "@/lib/notify";
import type { NotifyEvent } from "@/lib/notify/types";

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
    /* A demo hold is settled here and never sent to Pelecard: there is no
       transaction at the gateway to settle, and asking it to charge one would
       fail — correctly, but it would leave the demo lane unable to complete
       the very flow it exists to rehearse. The provider column decides, not
       the reference string, so nothing typed into a form can route a real
       payment down this branch. */
    const captured =
      hold.provider === "DEMO"
        ? ({ ok: true } as const)
        : await completeDebitByUid({
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

  // After the order has moved, never before, and never inside a transaction
  // with it. A customer told their payment was approved when the update then
  // failed is worse than a customer told a minute late.
  await notifyOrder(order.id, "PAYMENT_APPROVED");

  revalidateSellerViews(orderNumber);
  return { success: true, error: null, note };
}

/**
 * "יצא למשלוח" — the order leaves the building.
 *
 * The courier and the tracking number are typed in rather than fetched,
 * because no courier here has an account with us yet. When one does, this is
 * the function that grows a lookup; everything downstream — the customer's
 * message, the tracking link on their page — already reads these fields and
 * will not change.
 *
 * The link is stored, not built from the number. Every courier publishes a
 * different address for it and some publish none, and a URL assembled from a
 * pattern is a 404 in front of a customer who is already wondering where
 * their fridge is.
 */
export async function markShippedAction(
  orderNumber: string,
  courier: { name: string; trackingNumber: string; trackingUrl: string },
): Promise<Result> {
  const session = await requireBackOffice();
  const order = await db.order.findUnique({ where: { orderNumber } });
  if (!order) return { success: false, error: "הזמנה לא נמצאה" };

  if (order.paymentStatus === "AUTHORIZED") {
    return { success: false, error: "ההזמנה עדיין בדפוזיט. צריך לאשר את התשלום לפני שהיא יוצאת." };
  }
  if (order.paymentStatus !== "CAPTURED") {
    return { success: false, error: "אין תשלום מאושר להזמנה הזאת." };
  }
  const name = courier.name.trim();
  if (!name) return { success: false, error: "צריך לציין חברת שליחויות" };

  await db.order.update({
    where: { id: order.id },
    data: {
      status: "SHIPPED",
      shippedAt: new Date(),
      courierName: name,
      trackingNumber: courier.trackingNumber.trim() || null,
      trackingUrl: courier.trackingUrl.trim() || null,
    },
  });
  await db.orderStatusHistory.create({
    data: {
      orderId: order.id,
      fromStatus: order.status,
      toStatus: "SHIPPED",
      changedById: session.sub,
      note: `יצא עם ${name}${courier.trackingNumber.trim() ? ` · מעקב ${courier.trackingNumber.trim()}` : ""}`,
    },
  });
  await logAudit({
    actorId: session.sub,
    action: "ORDER_SHIPPED",
    entityType: "Order",
    entityId: order.id,
    metadata: { courier: name },
  });

  await notifyOrder(order.id, "SHIPPED");
  revalidateSellerViews(orderNumber);
  return { success: true, error: null };
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

  await db.order.update({
    where: { id: order.id },
    data: { status: "DELIVERED", deliveredAt: new Date() },
  });
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

  await notifyOrder(order.id, "DELIVERED");
  revalidateSellerViews(orderNumber);
  return { success: true, error: null };
}

function revalidateSellerViews(orderNumber: string) {
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderNumber}`);
  revalidatePath("/admin");
}

/**
 * Write down that somebody sent the WhatsApp by hand.
 *
 * Recorded in the same table as the automatic ones, and that is the point:
 * the order page's "what has the customer been told" list has to be true
 * regardless of who did the telling, and once Meta approves the templates
 * the unique index on (order, channel, event) means the automatic sender
 * finds this row and does not send it again.
 *
 * Best-effort by design. It is called after the link has already opened, so
 * a failure here must not look to the salesperson like the message did not
 * go — it did, in their own WhatsApp, and this is only the note about it.
 */
export async function logManualWhatsappAction(
  orderNumber: string,
  event: NotifyEvent,
): Promise<Result> {
  const session = await requireBackOffice();
  const order = await db.order.findUnique({
    where: { orderNumber },
    select: { id: true, guestPhone: true, user: { select: { phone: true } } },
  });
  if (!order) return { success: false, error: "הזמנה לא נמצאה" };

  await db.orderNotification.upsert({
    where: { orderId_channel_event: { orderId: order.id, channel: "WHATSAPP", event } },
    create: {
      orderId: order.id,
      channel: "WHATSAPP",
      event,
      recipient: order.user?.phone ?? order.guestPhone,
      status: "SENT",
      sentAt: new Date(),
      error: `נשלח ידנית · ${session.name}`,
    },
    update: { status: "SENT", sentAt: new Date(), error: `נשלח ידנית · ${session.name}` },
  });

  revalidateSellerViews(orderNumber);
  return { success: true, error: null };
}

/**
 * Put an order back where it was, because the last click was a mistake.
 *
 * Every one of the buttons on this page moves an order forward, and until
 * now none of them moved it back. Pressing "closed" on the wrong row sent it
 * to a tab with no way out, which is the worst shape a mistake can take:
 * silent, instant, and requiring someone else to fix.
 *
 * The previous status is read from the order's own history rather than
 * guessed from the current one. "Before this" is a fact the shop already
 * records, and inferring it — closed came from shipped, probably — is how an
 * order that went straight from paid to closed lands in a status it was
 * never in.
 *
 * Money is not undone. A capture that has happened has happened, at the
 * gateway and on the customer's statement, and a button here cannot reach
 * it; this moves the order's status and says so. Reversing a charge is a
 * refund, which is a different act with a different button and belongs to
 * whoever owns the till.
 */
export async function undoLastStatusAction(orderNumber: string): Promise<Result> {
  const session = await requireBackOffice();
  const order = await db.order.findUnique({
    where: { orderNumber },
    select: {
      id: true,
      status: true,
      statusHistory: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!order) return { success: false, error: "הזמנה לא נמצאה" };

  const last = order.statusHistory[0];
  if (!last || !last.fromStatus) {
    return { success: false, error: "אין שלב קודם לחזור אליו." };
  }
  if (last.toStatus !== order.status) {
    // Something moved the order after the entry we are about to undo. Undoing
    // now would not reverse the last change, it would reverse an older one and
    // discard whatever happened since.
    return { success: false, error: "ההזמנה השתנתה מאז. רענן את הדף ונסה שוב." };
  }

  await db.order.update({
    where: { id: order.id },
    data: {
      status: last.fromStatus,
      // Both are the record of a step that is being taken back. Left in
      // place they would show an order that is "in progress" and also
      // delivered, and the customer's tracking page reads them.
      ...(last.toStatus === "DELIVERED" ? { deliveredAt: null } : {}),
      ...(last.toStatus === "SHIPPED" ? { shippedAt: null } : {}),
    },
  });
  await db.orderStatusHistory.create({
    data: {
      orderId: order.id,
      fromStatus: last.toStatus,
      toStatus: last.fromStatus,
      changedById: session.sub,
      note: "ביטול הפעולה האחרונה",
    },
  });
  await logAudit({
    actorId: session.sub,
    action: "ORDER_STATUS_UNDONE",
    entityType: "Order",
    entityId: order.id,
    metadata: { from: last.toStatus, to: last.fromStatus },
  });

  revalidateSellerViews(orderNumber);
  return { success: true, error: null };
}

/**
 * Delete an order that should never have existed.
 *
 * Only one that took no money. An order whose card was charged is a
 * financial record — the shop's, the customer's and the gateway's — and no
 * button in a back office gets to make one disappear; the honest end for
 * those is CANCELLED, which keeps the row and says what happened.
 *
 * A demo order is the opposite case and the reason this exists: it is
 * rehearsal litter, it corresponds to nothing anywhere, and leaving a pile
 * of it in the queue is how a real order gets missed among the fakes.
 */
export async function deleteOrderAction(orderNumber: string): Promise<Result> {
  const session = await requireBackOffice();
  const order = await db.order.findUnique({
    where: { orderNumber },
    select: {
      id: true,
      total: true,
      paymentStatus: true,
      payments: { select: { provider: true, status: true } },
    },
  });
  if (!order) return { success: false, error: "הזמנה לא נמצאה" };

  const tookRealMoney = order.payments.some(
    (p) => p.provider !== "DEMO" && (p.status === "CAPTURED" || p.status === "AUTHORIZED"),
  );
  if (tookRealMoney) {
    return {
      success: false,
      error: "אי אפשר למחוק הזמנה שנגבה או נתפס בה כסף אמיתי. אפשר לבטל אותה — הביטול נשמר ברישום.",
    };
  }

  // Written before the row goes, because afterwards there is nothing to point
  // at. Items, payments, notifications and history all cascade with it.
  await logAudit({
    actorId: session.sub,
    action: "ORDER_DELETED",
    entityType: "Order",
    entityId: order.id,
    metadata: { orderNumber, total: order.total, paymentStatus: order.paymentStatus },
  });
  await db.order.delete({ where: { id: order.id } });

  revalidatePath("/admin/orders");
  revalidatePath("/admin");
  return { success: true, error: null };
}

/**
 * Send one message again, on every channel that can carry it.
 *
 * The button beside each update on the order page. It exists because the
 * automatic send is deliberately once-only, and "once" is wrong exactly when
 * a person can see it did not arrive — a bounced address since corrected, a
 * channel that was not configured at the time, a customer on the phone
 * saying they got nothing.
 */
export async function resendNotificationAction(
  orderNumber: string,
  event: NotifyEvent,
): Promise<Result> {
  await requireBackOffice();
  const order = await db.order.findUnique({ where: { orderNumber }, select: { id: true } });
  if (!order) return { success: false, error: "הזמנה לא נמצאה" };

  await notifyOrder(order.id, event, { force: true });
  revalidateSellerViews(orderNumber);
  return { success: true, error: null };
}
