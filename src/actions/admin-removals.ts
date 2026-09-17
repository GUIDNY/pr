"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireBackOffice } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { removalStatusSchema } from "@/lib/enums";

/**
 * The back office's side of the old-appliance removal.
 *
 * Three things a person does with one: move it along, agree a price for an
 * exceptional one, and — the one the whole feature turns on — record that the
 * carrier was actually told.
 *
 * Not restricted to catalogue managers. Arranging a removal is getting an
 * order out of the door, which is exactly the job a seller has; the
 * catalogue-manager gate exists for money and for the shop's own data, and a
 * removal is neither.
 */

export async function updateRemovalStatusAction(orderItemId: string, status: string) {
  const session = await requireBackOffice();
  const parsed = removalStatusSchema.safeParse(status);
  if (!parsed.success) return { success: false as const, error: "סטטוס לא תקין" };

  const line = await db.orderItem.findUnique({
    where: { id: orderItemId },
    select: { id: true, removalStatus: true, removalRequested: true, order: { select: { orderNumber: true } } },
  });
  if (!line) return { success: false as const, error: "שורת הזמנה לא נמצאה" };
  /* A line nobody asked a removal for has no removal to move. Refused rather
     than allowed through, because the only way to reach this is a stale
     screen — and a removal invented in the back office is one the customer
     never agreed to and will not have prepared for. */
  if (!line.removalRequested) return { success: false as const, error: "לא התבקש פינוי בשורה הזו" };

  await db.orderItem.update({ where: { id: orderItemId }, data: { removalStatus: parsed.data } });
  await logAudit({
    actorId: session.sub,
    action: "REMOVAL_STATUS_CHANGED",
    entityType: "OrderItem",
    entityId: orderItemId,
    metadata: { from: line.removalStatus, to: parsed.data },
  });

  revalidatePath(`/admin/orders/${line.order.orderNumber}`);
  revalidatePath("/admin/orders");
  return { success: true as const, error: null };
}

/**
 * What an exceptional removal was agreed at.
 *
 * Recorded after the phone call, never before it: the law wants the customer
 * to know the price before the work, and the number they were told is the
 * number that goes here. Zero is allowed and means "we looked at it and it is
 * free after all", which is a different fact from null.
 */
export async function setRemovalFeeAction(orderItemId: string, fee: number | null) {
  const session = await requireBackOffice();
  if (fee !== null && (!Number.isFinite(fee) || fee < 0 || fee > 5000)) {
    return { success: false as const, error: "סכום לא תקין" };
  }

  const line = await db.orderItem.findUnique({
    where: { id: orderItemId },
    select: { id: true, removalRequested: true, order: { select: { orderNumber: true } } },
  });
  if (!line?.removalRequested) return { success: false as const, error: "לא התבקש פינוי בשורה הזו" };

  await db.orderItem.update({ where: { id: orderItemId }, data: { removalFee: fee } });
  await logAudit({
    actorId: session.sub,
    action: "REMOVAL_FEE_SET",
    entityType: "OrderItem",
    entityId: orderItemId,
    metadata: { fee },
  });

  revalidatePath(`/admin/orders/${line.order.orderNumber}`);
  return { success: true as const, error: null };
}

/**
 * THE ONE THE FEATURE TURNS ON: the carrier has been given the removal.
 *
 * The brief puts it plainly — there must be no situation where the customer
 * ticked the box on the website and the driver never heard about it. There is
 * no API to צ'יטה here; a removal reaches them the way a delivery does, in the
 * booking a person makes. So what the software can do is make the gap
 * visible: the panel shows the hand-off text to copy, this records that it
 * went, and until it does the order carries a warning in the list and on its
 * own page.
 *
 * Stamped on every requested line of the order at once, because the hand-off
 * is one conversation about one delivery, not one per appliance.
 */
export async function markRemovalHandedOffAction(orderId: string) {
  const session = await requireBackOffice();

  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { id: true, orderNumber: true },
  });
  if (!order) return { success: false as const, error: "הזמנה לא נמצאה" };

  const { count } = await db.orderItem.updateMany({
    where: { orderId, removalRequested: true },
    data: { removalHandedOffAt: new Date() },
  });
  if (count === 0) return { success: false as const, error: "אין פינוי בהזמנה הזו" };

  await logAudit({
    actorId: session.sub,
    action: "REMOVAL_HANDED_OFF",
    entityType: "Order",
    entityId: orderId,
    metadata: { lines: count },
  });

  revalidatePath(`/admin/orders/${order.orderNumber}`);
  revalidatePath("/admin/orders");
  return { success: true as const, error: null };
}
