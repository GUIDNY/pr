import "server-only";
import { db } from "@/lib/db";

export async function getOrderByNumber(orderNumber: string) {
  return db.order.findUnique({
    where: { orderNumber },
    include: {
      items: true,
      address: true,
      statusHistory: { orderBy: { createdAt: "asc" } },
      notes: { where: { isInternal: false }, orderBy: { createdAt: "asc" } },
    },
  });
}

export async function verifyOrderAccess(orderNumber: string, contact: string) {
  const order = await getOrderByNumber(orderNumber);
  if (!order) return null;
  const normalizedContact = contact.trim().toLowerCase();
  const matches =
    order.guestEmail?.toLowerCase() === normalizedContact ||
    order.guestPhone === contact.trim() ||
    (order.userId ? (await db.user.findUnique({ where: { id: order.userId } }))?.email.toLowerCase() === normalizedContact : false) ||
    (order.userId ? (await db.user.findUnique({ where: { id: order.userId } }))?.phone === contact.trim() : false);
  return matches ? order : null;
}
