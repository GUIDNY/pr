"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { orderStatusSchema } from "@/lib/enums";

export async function updateOrderStatusAction(orderId: string, newStatus: string, note?: string) {
  const session = await requireAdmin();
  const parsed = orderStatusSchema.safeParse(newStatus);
  if (!parsed.success) return { success: false, error: "סטטוס לא תקין" };

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
  const session = await requireAdmin();
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
  const session = await requireAdmin();
  if (!body.trim()) return { success: false, error: "יש להזין תוכן להערה" };

  const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  await db.orderNote.create({ data: { orderId, authorId: session.sub, body: body.trim(), isInternal } });
  await logAudit({ actorId: session.sub, action: "ORDER_NOTE_ADDED", entityType: "Order", entityId: orderId });

  revalidatePath(`/admin/orders/${order.orderNumber}`);
  return { success: true, error: null };
}

export async function updateExpectedDeliveryAction(orderId: string, date: string) {
  const session = await requireAdmin();
  const order = await db.order.update({ where: { id: orderId }, data: { expectedDeliveryAt: new Date(date) } });
  await logAudit({ actorId: session.sub, action: "ORDER_DELIVERY_DATE_UPDATED", entityType: "Order", entityId: orderId, metadata: { date } });
  revalidatePath(`/admin/orders/${order.orderNumber}`);
  return { success: true, error: null };
}
