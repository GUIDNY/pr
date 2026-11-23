"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireBackOffice } from "@/lib/auth";
import { canManageCatalog } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { orderStatusSchema } from "@/lib/enums";

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

  const data: Record<string, unknown> = { status: parsed.data };
  if (parsed.data === "REFUNDED") data.paymentStatus = "REFUNDED";

  await db.order.update({ where: { id: orderId }, data });
  await db.orderStatusHistory.create({
    data: { orderId, fromStatus: order.status, toStatus: parsed.data, changedById: session.sub, note },
  });
  await logAudit({
    actorId: session.sub,
    action: "ORDER_STATUS_CHANGED",
    entityType: "Order",
    entityId: orderId,
    metadata: { from: order.status, to: parsed.data },
  });

  if (parsed.data === "REFUNDED") {
    await db.payment.create({
      data: { orderId, provider: "DEMO", amount: order.total, status: "REFUNDED", reference: `REFUND-${order.orderNumber}` },
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

/* Every note written here is internal, always: the customer's own queries read
   only the non-internal ones, and nothing in the admin creates those. */
export async function addOrderNoteAction(orderId: string, body: string) {
  const session = await requireBackOffice();
  if (!body.trim()) return { success: false, error: "יש להזין תוכן להערה" };

  const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  await db.orderNote.create({ data: { orderId, authorId: session.sub, body: body.trim().slice(0, 1000), isInternal: true } });
  await logAudit({ actorId: session.sub, action: "ORDER_NOTE_ADDED", entityType: "Order", entityId: orderId });

  revalidatePath(`/admin/orders/${order.orderNumber}`);
  revalidatePath("/admin/orders");
  return { success: true, error: null };
}

/* Editing a note rewrites its text and nothing else; there is no delete. The
   previous text is kept in the audit log, and the "edited" mark in the UI is
   read from that same log. Only the author or a catalog manager may edit. */
export async function editOrderNoteAction(noteId: string, body: string) {
  const session = await requireBackOffice();
  const text = body.trim();
  if (!text) return { success: false, error: "יש להזין תוכן להערה" };

  const note = await db.orderNote.findUnique({ where: { id: noteId }, include: { order: { select: { orderNumber: true } } } });
  if (!note) return { success: false, error: "ההערה לא נמצאה" };
  if (note.authorId !== session.sub && !canManageCatalog(session.role)) {
    return { success: false, error: "רק כותב ההערה או מנהל יכולים לערוך אותה" };
  }
  const next = text.slice(0, 1000);
  if (next === note.body) return { success: true, error: null };

  await db.orderNote.update({ where: { id: noteId }, data: { body: next } });
  await logAudit({
    actorId: session.sub,
    action: "ORDER_NOTE_EDITED",
    entityType: "OrderNote",
    entityId: noteId,
    metadata: { orderId: note.orderId, previousBody: note.body },
  });

  revalidatePath(`/admin/orders/${note.order.orderNumber}`);
  revalidatePath("/admin/orders");
  return { success: true, error: null };
}

export async function updateExpectedDeliveryAction(orderId: string, date: string) {
  const session = await requireBackOffice();
  const order = await db.order.update({ where: { id: orderId }, data: { expectedDeliveryAt: new Date(date) } });
  await logAudit({ actorId: session.sub, action: "ORDER_DELIVERY_DATE_UPDATED", entityType: "Order", entityId: orderId, metadata: { date } });
  revalidatePath(`/admin/orders/${order.orderNumber}`);
  return { success: true, error: null };
}
