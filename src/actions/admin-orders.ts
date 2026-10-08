"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireBackOffice } from "@/lib/auth";
import { canManageCatalog } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { orderStatusSchema } from "@/lib/enums";
import { refundOrderToWallet } from "@/lib/wallet";

export async function updateOrderStatusAction(orderId: string, newStatus: string, note?: string) {
  const session = await requireBackOffice();
  const parsed = orderStatusSchema.safeParse(newStatus);
  if (!parsed.success) return { success: false, error: "סטטוס לא תקין" };

  /* Moving an order along is the job. Sending money back is not: REFUNDED
     writes a refund row and REFUND_PENDING is the step before it, and both
     belong to whoever owns the till. */
  if (
    (parsed.data === "REFUNDED" || parsed.data === "REFUND_PENDING") &&
    !canManageCatalog(session.role)
  ) {
    return { success: false, error: "זיכוי הזמנה מחייב הרשאת מנהל" };
  }

  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) return { success: false, error: "הזמנה לא נמצאה" };

  /* AN ORDER PAID FROM THE BUYTODAY BALANCE gets its balance back when it is
     cancelled or refunded — there is no card to refund at Pelecard, so this
     is the refund. It moves money, so like REFUNDED above it is the till
     owner's, CANCELLED included. Written before the status changes, so a
     failure leaves the order exactly as it was; once per order whatever is
     pressed twice (lib/wallet.ts). */
  const walletRefund =
    order.paymentMethod === "WALLET" &&
    (parsed.data === "CANCELLED" || parsed.data === "REFUNDED") &&
    order.paymentStatus === "CAPTURED";
  if (walletRefund && !canManageCatalog(session.role)) {
    return { success: false, error: "ביטול הזמנה ששולמה מהיתרה מחזיר כסף ללקוח, ומחייב הרשאת מנהל" };
  }
  let walletCredited = 0;
  if (walletRefund) {
    try {
      walletCredited = await refundOrderToWallet(orderId, session.sub);
    } catch (error) {
      console.error("[wallet] refund failed", { orderId, error });
      return { success: false, error: "החזרת הסכום ליתרת הלקוח נכשלה. ההזמנה לא שונתה." };
    }
  }

  const data: Record<string, unknown> = { status: parsed.data };
  if (parsed.data === "REFUNDED" || walletRefund) data.paymentStatus = "REFUNDED";

  await db.order.update({ where: { id: orderId }, data });
  await db.orderStatusHistory.create({
    data: {
      orderId,
      fromStatus: order.status,
      toStatus: parsed.data,
      changedById: session.sub,
      note: walletCredited
        ? [note, `₪${(walletCredited / 100).toLocaleString("he-IL")} הוחזרו ליתרת הלקוח`].filter(Boolean).join(" · ")
        : note,
    },
  });
  await logAudit({
    actorId: session.sub,
    action: "ORDER_STATUS_CHANGED",
    entityType: "Order",
    entityId: orderId,
    metadata: { from: order.status, to: parsed.data, ...(walletCredited ? { walletCreditedAgorot: walletCredited } : {}) },
  });

  if (parsed.data === "REFUNDED" || walletRefund) {
    await db.payment.create({
      data: {
        orderId,
        provider: order.paymentMethod === "WALLET" ? "WALLET" : "DEMO",
        amount: order.total,
        status: "REFUNDED",
        reference: `REFUND-${order.orderNumber}`,
      },
    });
  }

  revalidatePath(`/admin/orders/${order.orderNumber}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin");
  return { success: true, error: null };
}

export async function assignOrderAction(orderId: string, employeeId: string | null) {
  const session = await requireBackOffice();
  const order = await db.order.update({ where: { id: orderId }, data: { assignedToId: employeeId } });
  await logAudit({
    actorId: session.sub,
    action: "ORDER_ASSIGNED",
    entityType: "Order",
    entityId: orderId,
    metadata: { employeeId },
  });
  revalidatePath(`/admin/orders/${order.orderNumber}`);
  return { success: true, error: null };
}

export async function addOrderNoteAction(orderId: string, body: string, isInternal: boolean) {
  const session = await requireBackOffice();
  if (!body.trim()) return { success: false, error: "יש להזין תוכן להערה" };

  const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  await db.orderNote.create({ data: { orderId, authorId: session.sub, body: body.trim(), isInternal } });
  await logAudit({ actorId: session.sub, action: "ORDER_NOTE_ADDED", entityType: "Order", entityId: orderId });

  revalidatePath(`/admin/orders/${order.orderNumber}`);
  return { success: true, error: null };
}

export async function updateExpectedDeliveryAction(orderId: string, date: string) {
  const session = await requireBackOffice();
  const order = await db.order.update({ where: { id: orderId }, data: { expectedDeliveryAt: new Date(date) } });
  await logAudit({ actorId: session.sub, action: "ORDER_DELIVERY_DATE_UPDATED", entityType: "Order", entityId: orderId, metadata: { date } });
  revalidatePath(`/admin/orders/${order.orderNumber}`);
  return { success: true, error: null };
}
