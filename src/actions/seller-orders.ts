"use server";

import { awardPurchase } from "@/lib/game-levels";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireBackOffice } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { completeDebitByUid } from "@/lib/pelecard/client";
import { notifyOrder } from "@/lib/notify";
import type { NotifyEvent } from "@/lib/notify/types";
import { removalRule, binActionAllowed, type BinDirection } from "@/lib/queries/seller-orders";
import { INTERNAL_DELIVERY_NAME } from "@/lib/couriers";
import { MANUAL_PAYMENT_METHOD_LABELS, manualPaymentMethodSchema, type ManualPaymentMethod } from "@/lib/enums";
import { undoableStep } from "@/lib/order-undo";
import { sendPurchaseToGa4 } from "@/lib/analytics/ga4-purchase";

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
    await awardPurchase(order.id);
    await sendPurchaseToGa4(order.id);
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

  /* NOT NOTIFIED HERE. The shop's owner asked, on 26 October, that nothing
     reach a customer because he pressed a button in the back office — only
     because he pressed SEND. Every one of these four actions used to message
     the customer as a side effect of moving the order, which meant a status
     corrected a minute later had already been announced, and a mistake could
     not be taken back. The panel on the order page sends each update on
     demand (resendNotificationAction), and that is now the only path from the
     back office to a customer's phone.

     ORDER_RECEIVED is deliberately NOT part of this: nobody presses anything
     to place an order, and a customer who has just paid and hears nothing has
     been left to wonder whether it went through. */

  revalidateSellerViews(orderNumber);
  return { success: true, error: null, note };
}

/**
 * "שולם ידנית" — the money arrived some other way than the gateway.
 *
 * The owner's case, 15 October: a customer abandoned the payment page and
 * was then closed over the phone — card read out, or a transfer, or a bit.
 * The order sat in "עגלות נטושות" as טרם שולם with no button that could say
 * otherwise, and "אשר הזמנה" correctly refused it because no payment had
 * ever opened.
 *
 * This records the payment the way the gateway would have, so everything
 * downstream is the same as after a captured deposit: a CAPTURED Payment
 * row (provider MANUAL — it took real money, so the bin refuses it like any
 * other), the order's paymentStatus CAPTURED, status PROCESSING, the
 * customer's "התשלום אושר" message, the loyalty points, and a history row
 * naming who pressed it and how the customer paid. The amount is the
 * order's total — a partial payment is not a paid order, and a different
 * sum is an edit to the order first.
 *
 * Refused on an order the gateway already settled or refunded: a manual
 * mark over a real charge would be two payments for one sale.
 */
export async function markPaidManuallyAction(
  orderNumber: string,
  input: { method: ManualPaymentMethod; reference?: string },
): Promise<Result> {
  const session = await requireBackOffice();
  const parsed = manualPaymentMethodSchema.safeParse(input.method);
  if (!parsed.success) return { success: false, error: "צריך לבחור איך הלקוח שילם." };
  const method = parsed.data;
  const reference = (input.reference ?? "").trim().slice(0, 80) || null;

  const order = await db.order.findUnique({
    where: { orderNumber },
    select: { id: true, status: true, paymentStatus: true, total: true, deletedAt: true },
  });
  if (!order) return { success: false, error: "הזמנה לא נמצאה" };
  if (order.deletedAt) return { success: false, error: "ההזמנה בפח. שחזרו אותה קודם." };
  if (order.paymentStatus === "CAPTURED" || order.paymentStatus === "AUTHORIZED") {
    return { success: false, error: "להזמנה הזאת כבר יש תשלום." };
  }
  if (order.paymentStatus === "REFUNDED" || order.status === "CANCELLED") {
    return { success: false, error: "ההזמנה בוטלה או זוכתה. אי אפשר לסמן אותה כשולמה." };
  }
  if (!(order.total > 0)) return { success: false, error: "להזמנה אין סכום לתשלום." };

  const label = MANUAL_PAYMENT_METHOD_LABELS[method];
  const note = `סומן כשולם ידנית — ${label}${reference ? ` (${reference})` : ""}`;
  const now = new Date();

  await db.$transaction([
    db.payment.create({
      data: {
        orderId: order.id,
        provider: "MANUAL",
        amount: order.total,
        amountAgorot: Math.round(order.total * 100),
        status: "CAPTURED",
        reference,
        capturedAt: now,
        environment: "production",
        rawResponse: { manual: { method, reference, by: session.sub, at: now.toISOString() } },
      },
    }),
    db.order.update({
      where: { id: order.id },
      data: { paymentStatus: "CAPTURED", paymentMethod: method, status: "PROCESSING" },
    }),
    db.orderStatusHistory.create({
      data: { orderId: order.id, fromStatus: order.status, toStatus: "PROCESSING", changedById: session.sub, note },
    }),
  ]);
  await logAudit({
    actorId: session.sub,
    action: "ORDER_PAID_MANUALLY",
    entityType: "Order",
    entityId: order.id,
    metadata: { from: order.status, method, reference, amount: order.total },
  });
  await awardPurchase(order.id);
  await sendPurchaseToGa4(order.id);

  /* NOT NOTIFIED HERE. The shop's owner asked, on 26 October, that nothing
     reach a customer because he pressed a button in the back office — only
     because he pressed SEND. Every one of these four actions used to message
     the customer as a side effect of moving the order, which meant a status
     corrected a minute later had already been announced, and a mistake could
     not be taken back. The panel on the order page sends each update on
     demand (resendNotificationAction), and that is now the only path from the
     back office to a customer's phone.

     ORDER_RECEIVED is deliberately NOT part of this: nobody presses anything
     to place an order, and a customer who has just paid and hears nothing has
     been left to wonder whether it went through. */

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
/**
 * The order leaves the shop, with a courier or with our own driver.
 *
 * `internal` is the second case and it changes three things at once, which
 * is why it is a flag here rather than a courier the salesperson types: the
 * carrier name becomes ours, the tracking fields are dropped rather than
 * trusted (a number left in the form from a previous attempt would otherwise
 * be sent to the customer as a consignment that does not exist), and the
 * shipped notification switches to the wording with no tracking line in it.
 */
export async function markShippedAction(
  orderNumber: string,
  courier: { name: string; trackingNumber: string; trackingUrl: string; internal?: boolean },
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
  const internal = courier.internal === true;
  const name = internal ? INTERNAL_DELIVERY_NAME : courier.name.trim();
  if (!name) return { success: false, error: "צריך לציין חברת שליחויות" };
  const trackingNumber = internal ? null : courier.trackingNumber.trim() || null;
  const trackingUrl = internal ? null : courier.trackingUrl.trim() || null;

  await db.order.update({
    where: { id: order.id },
    data: {
      status: "SHIPPED",
      shippedAt: new Date(),
      courierName: name,
      trackingNumber,
      trackingUrl,
    },
  });
  await db.orderStatusHistory.create({
    data: {
      orderId: order.id,
      fromStatus: order.status,
      toStatus: "SHIPPED",
      changedById: session.sub,
      note: internal
        ? "יצא עם שליח שלנו (משלוח פנימי) — ללא מספר מעקב"
        : `יצא עם ${name}${trackingNumber ? ` · מעקב ${trackingNumber}` : ""}`,
    },
  });
  await logAudit({
    actorId: session.sub,
    action: "ORDER_SHIPPED",
    entityType: "Order",
    entityId: order.id,
    metadata: { courier: name, internal },
  });

  /* NOT NOTIFIED HERE. The shop's owner asked, on 26 October, that nothing
     reach a customer because he pressed a button in the back office — only
     because he pressed SEND. Every one of these four actions used to message
     the customer as a side effect of moving the order, which meant a status
     corrected a minute later had already been announced, and a mistake could
     not be taken back. The panel on the order page sends each update on
     demand (resendNotificationAction), and that is now the only path from the
     back office to a customer's phone.

     ORDER_RECEIVED is deliberately NOT part of this: nobody presses anything
     to place an order, and a customer who has just paid and hears nothing has
     been left to wonder whether it went through. */
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

  /* NOT NOTIFIED HERE. The shop's owner asked, on 26 October, that nothing
     reach a customer because he pressed a button in the back office — only
     because he pressed SEND. Every one of these four actions used to message
     the customer as a side effect of moving the order, which meant a status
     corrected a minute later had already been announced, and a mistake could
     not be taken back. The panel on the order page sends each update on
     demand (resendNotificationAction), and that is now the only path from the
     back office to a customer's phone.

     ORDER_RECEIVED is deliberately NOT part of this: nobody presses anything
     to place an order, and a customer who has just paid and hears nothing has
     been left to wonder whether it went through. */
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

  // A message the API already delivered keeps its record: the by-hand
  // note must not paint over the automatic result, or nobody can tell
  // afterwards whether the API worked. Only a row that did not go —
  // skipped, failed, or never claimed — is written as sent by hand.
  const existing = await db.orderNotification.findUnique({
    where: { orderId_channel_event: { orderId: order.id, channel: "WHATSAPP", event } },
    select: { status: true, error: true },
  });
  if (existing?.status === "SENT" && !existing.error?.startsWith("נשלח ידנית")) {
    return { success: true, error: null };
  }
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
      statusHistory: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { fromStatus: true, toStatus: true, isUndo: true },
      },
    },
  });
  if (!order) return { success: false, error: "הזמנה לא נמצאה" };

  /* One step, and never an undo of an undo — see lib/order-undo.ts and
     PR-902319, which was flipped between two statuses nine times in half
     an hour because each undo became the thing the next one undid. */
  const last = undoableStep(order.statusHistory);
  if (!last) {
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
      /* The flag, not the note, is what the next press reads. A rule that
         lives in free text is one a translation or a typo switches off. */
      isUndo: true,
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
      status: true,
      total: true,
      paymentStatus: true,
      payments: { select: { provider: true, status: true, holdExpiresAt: true } },
    },
  });
  if (!order) return { success: false, error: "הזמנה לא נמצאה" };

  const rule = removalRule(order);
  if (!rule.canPurge) return { success: false, error: rule.reason ?? "אי אפשר למחוק את ההזמנה הזאת." };
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
 * The bin: move, restore, destroy.
 *
 * Three actions rather than one with a mode, because they are three
 * different promises and the UI should not be able to get them confused.
 * Moving and restoring are reversible and need no ceremony. Destroying is
 * not, and it is reachable from one place only — the bin tab — so that
 * "clear out the test orders" and "delete fifteen orders for ever" cannot
 * be the same click.
 *
 * All three take order NUMBERS, the thing a person reads on the screen, so
 * that a mis-wired id cannot delete a row nobody chose. They are also all
 * all-or-nothing on the money rule: one order in the selection that took
 * real money stops the whole batch and names it, rather than quietly doing
 * fourteen of the fifteen and leaving somebody to work out which.
 */
type BulkResult = Result & { count?: number };

const LIMIT = 200;

async function loadSelection(orderNumbers: string[], wantBinned: boolean, mode: BinDirection) {
  const unique = [...new Set(orderNumbers.filter(Boolean))];
  if (unique.length === 0) return { error: "לא נבחרו הזמנות" as const, orders: [] };
  if (unique.length > LIMIT) return { error: `אפשר עד ${LIMIT} הזמנות בפעולה אחת`, orders: [] };

  const orders = await db.order.findMany({
    where: { orderNumber: { in: unique } },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      total: true,
      paymentStatus: true,
      deletedAt: true,
      payments: { select: { provider: true, status: true, holdExpiresAt: true } },
    },
  });
  if (orders.length !== unique.length) {
    return { error: "חלק מההזמנות כבר לא קיימות — רענן את הדף", orders: [] };
  }

  /* Asked per direction, and restore is always allowed — see
     binActionAllowed for the order that spent a day trapped in the bin
     because this was asked on the way out as well as on the way in.
     Destroying asks the stricter question: a cancelled order with a hold
     still on the card may sit in the bin, and may not be purged until the
     hold lapses. */
  const refused = orders.filter((o) => !binActionAllowed(o, mode).allowed);
  if (refused.length > 0) {
    return {
      error: `${refused.length} מההזמנות שנבחרו הן רישום כספי (${refused
        .slice(0, 3)
        .map((o) => o.orderNumber)
        .join(", ")}${refused.length > 3 ? "…" : ""}). ${binActionAllowed(refused[0], mode).reason ?? ""}`,
      orders: [],
    };
  }
  const wrongSide = orders.filter((o) => (o.deletedAt !== null) !== wantBinned);
  if (wrongSide.length > 0) {
    return { error: "חלק מההזמנות כבר לא במצב הזה — רענן את הדף", orders: [] };
  }

  return { error: null, orders };
}

/** "העבר לפח" — out of every queue and count, still here. */
export async function trashOrdersAction(orderNumbers: string[]): Promise<BulkResult> {
  const session = await requireBackOffice();
  const { error, orders } = await loadSelection(orderNumbers, false, "bin");
  if (error) return { success: false, error };

  await db.order.updateMany({
    where: { id: { in: orders.map((o) => o.id) } },
    data: { deletedAt: new Date() },
  });
  for (const order of orders) {
    await logAudit({
      actorId: session.sub,
      action: "ORDER_TRASHED",
      entityType: "Order",
      entityId: order.id,
      metadata: { orderNumber: order.orderNumber, total: order.total },
    });
  }

  revalidateOrderLists();
  return { success: true, error: null, count: orders.length };
}

/** "שחזר" — back to whichever tab its status puts it in. */
export async function restoreOrdersAction(orderNumbers: string[]): Promise<BulkResult> {
  const session = await requireBackOffice();
  const { error, orders } = await loadSelection(orderNumbers, true, "restore");
  if (error) return { success: false, error };

  await db.order.updateMany({
    where: { id: { in: orders.map((o) => o.id) } },
    data: { deletedAt: null },
  });
  for (const order of orders) {
    await logAudit({
      actorId: session.sub,
      action: "ORDER_RESTORED",
      entityType: "Order",
      entityId: order.id,
      metadata: { orderNumber: order.orderNumber },
    });
  }

  revalidateOrderLists();
  return { success: true, error: null, count: orders.length };
}

/**
 * "מחק לצמיתות" — the row and everything hanging off it.
 *
 * Only from the bin, so nothing is destroyed that was not first set aside
 * and looked at a second time. Items, payments, notifications, notes and
 * history cascade; the audit lines are written first, because afterwards
 * there is no row left to point at and they are the only record that these
 * orders ever existed.
 */
export async function purgeOrdersAction(orderNumbers: string[]): Promise<BulkResult> {
  const session = await requireBackOffice();
  const { error, orders } = await loadSelection(orderNumbers, true, "purge");
  if (error) return { success: false, error };

  for (const order of orders) {
    await logAudit({
      actorId: session.sub,
      action: "ORDER_DELETED",
      entityType: "Order",
      entityId: order.id,
      metadata: {
        orderNumber: order.orderNumber,
        total: order.total,
        paymentStatus: order.paymentStatus,
        via: "bulk-purge",
      },
    });
  }
  const { count } = await db.order.deleteMany({ where: { id: { in: orders.map((o) => o.id) } } });

  revalidateOrderLists();
  return { success: true, error: null, count };
}

function revalidateOrderLists() {
  revalidatePath("/admin/orders");
  revalidatePath("/admin");
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
/**
 * What the delivery actually cost the shop, typed in by hand.
 *
 * There is no carrier integration to read it from and it differs per order —
 * a courier to Eilat and a pickup from the branch are not the same number — so
 * it is entered rather than derived. Null is a real value here and means
 * "nobody has said yet", which is why an empty box clears it rather than
 * writing a zero: a zero is a claim that delivery was free, and the profit
 * panel reads the two differently.
 *
 * Audited like any other money field. It changes what the shop believes it
 * earned, so who set it and when is worth keeping.
 */
export async function setDeliveryCostAction(orderNumber: string, value: string): Promise<Result> {
  const session = await requireBackOffice();
  const order = await db.order.findUnique({ where: { orderNumber }, select: { id: true, deliveryCost: true } });
  if (!order) return { success: false, error: "הזמנה לא נמצאה" };

  const trimmed = value.trim();
  let cost: number | null = null;
  if (trimmed !== "") {
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) return { success: false, error: "עלות משלוח חייבת להיות מספר אי-שלילי" };
    /* Agorot, not fractions of one. A pasted figure with four decimals is a
       paste, not a price. */
    cost = Math.round(parsed * 100) / 100;
  }

  await db.order.update({ where: { id: order.id }, data: { deliveryCost: cost } });
  await logAudit({
    actorId: session.sub,
    action: "ORDER_DELIVERY_COST_SET",
    entityType: "Order",
    entityId: order.id,
    metadata: { from: order.deliveryCost, to: cost },
  });

  revalidateSellerViews(orderNumber);
  return { success: true, error: null };
}

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
