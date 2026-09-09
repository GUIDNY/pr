import "server-only";
import { db } from "@/lib/db";
import { SITE_URL } from "@/lib/site-url";
import { CHANNELS } from "./channels";
import { messageFor } from "./messages";
import type { NotifyEvent } from "./types";

export * from "./types";
export { CHANNELS } from "./channels";

/**
 * Tell the customer that something happened to their order, on every channel
 * the shop has.
 *
 * Three properties matter more than the sending itself:
 *
 *   It never throws. A notification is a side effect of an order moving, and
 *   an order that moved must not be rolled back because an email bounced.
 *   Every failure is caught, written down and returned.
 *
 *   It never sends twice. The unique index on (orderId, channel, event) does
 *   that, not a check-then-write: two clicks a second apart would both pass
 *   a check. The row is claimed first and the message is sent after, so the
 *   loser of the race is the one that finds the row already there.
 *
 *   A channel with no account is SKIPPED, not FAILED. A shop that has not
 *   bought SMS did not fail to send an SMS, and colouring those red is how
 *   the one that really failed stops being visible.
 */
export async function notifyOrder(orderId: string, event: NotifyEvent): Promise<void> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      total: true,
      deliveryMethod: true,
      courierName: true,
      trackingNumber: true,
      trackingUrl: true,
      guestName: true,
      guestEmail: true,
      guestPhone: true,
      user: { select: { name: true, email: true, phone: true } },
    },
  });
  if (!order) return;

  const email = order.user?.email ?? order.guestEmail ?? null;
  const phone = order.user?.phone ?? order.guestPhone ?? null;

  const message = messageFor(event, {
    orderNumber: order.orderNumber,
    customerName: order.user?.name ?? order.guestName ?? "לקוח",
    total: order.total,
    deliveryToCustomer: order.deliveryMethod === "DELIVERY",
    courierName: order.courierName,
    trackingNumber: order.trackingNumber,
    trackingUrl: order.trackingUrl,
    trackUrl: `${SITE_URL}/track-order`,
  });

  for (const channel of CHANNELS) {
    const to = channel.id === "EMAIL" ? email : phone;

    // Claim the row before doing anything slow. A duplicate key here is not
    // an error condition, it is the answer: somebody already sent this.
    let claimed;
    try {
      claimed = await db.orderNotification.create({
        data: { orderId: order.id, channel: channel.id, event, recipient: to },
      });
    } catch {
      continue;
    }

    if (!to) {
      await mark(claimed.id, "SKIPPED", channel.id === "EMAIL" ? "אין מייל ללקוח" : "אין טלפון ללקוח");
      continue;
    }
    if (!channel.configured()) {
      await mark(claimed.id, "SKIPPED", `לא מוגדר: ${channel.missing().join(", ")}`);
      continue;
    }

    try {
      const result = await channel.send(to, message);
      if (result.ok) {
        await db.orderNotification.update({
          where: { id: claimed.id },
          data: { status: "SENT", sentAt: new Date() },
        });
      } else {
        await mark(claimed.id, "FAILED", result.error);
      }
    } catch (error) {
      await mark(claimed.id, "FAILED", error instanceof Error ? error.message : "send failed");
    }
  }
}

function mark(id: string, status: string, error: string | null) {
  return db.orderNotification.update({ where: { id }, data: { status, error } });
}

/** What the admin screen shows about which channels are live. */
export function channelReadiness() {
  return CHANNELS.map((c) => ({ id: c.id, configured: c.configured(), missing: c.missing() }));
}
