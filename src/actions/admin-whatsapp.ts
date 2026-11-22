"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireBackOffice } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

/**
 * Records that somebody opened the reminder in WhatsApp, as an internal
 * note (author and time come with it), so the same customer is not written
 * to twice. The message itself is not stored.
 */
export async function recordOrderWhatsappAction(orderId: string) {
  const session = await requireBackOffice();
  const order = await db.order.findUnique({ where: { id: orderId }, select: { orderNumber: true } });
  if (!order) return { success: false, error: "הזמנה לא נמצאה" };
  await db.orderNote.create({
    data: { orderId, authorId: session.sub, body: "נשלחה הודעת וואטסאפ", isInternal: true },
  });
  await logAudit({ actorId: session.sub, action: "ORDER_WHATSAPP_OPENED", entityType: "Order", entityId: orderId });
  revalidatePath(`/admin/orders/${order.orderNumber}`);
  revalidatePath("/admin/orders");
  return { success: true, error: null };
}
