import "server-only";
import { db } from "@/lib/db";

/** What the "send WhatsApp" box needs for an order that did not get paid.
    Null for any other status: the button exists only where a payment is
    unfinished. */
export async function paymentReminderContext(orderNumber: string) {
  const order = await db.order.findUnique({
    where: { orderNumber },
    select: {
      id: true,
      status: true,
      guestName: true,
      guestPhone: true,
      whatsappOptIn: true,
      user: { select: { name: true, phone: true } },
      items: { select: { titleSnap: true } },
    },
  });
  if (!order || !["PAYMENT_FAILED", "PAYMENT_PENDING"].includes(order.status)) return null;
  return {
    orderId: order.id,
    name: order.user?.name ?? order.guestName ?? null,
    phone: order.user?.phone ?? order.guestPhone ?? null,
    optIn: order.whatsappOptIn,
    titles: order.items.map((i) => i.titleSnap),
  };
}
