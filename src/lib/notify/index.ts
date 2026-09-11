import "server-only";
import { db } from "@/lib/db";
import { SITE_URL } from "@/lib/site-url";
import { CHANNELS } from "./channels";
import { messageFor } from "./messages";
import { renderOrderEmail } from "./email-html";
import type { Message, NotifyEvent } from "./types";

export * from "./types";
export { CHANNELS } from "./channels";

const ORDER_SELECT = {
  id: true,
  orderNumber: true,
  subtotal: true,
  discountTotal: true,
  deliveryFee: true,
  total: true,
  deliveryMethod: true,
  shipCity: true,
  shipStreet: true,
  shipHouseNo: true,
  shipApartment: true,
  courierName: true,
  trackingNumber: true,
  trackingUrl: true,
  guestName: true,
  guestEmail: true,
  guestPhone: true,
  user: { select: { name: true, email: true, phone: true } },
  items: { select: { titleSnap: true, quantity: true, priceSnap: true } },
} as const;

type OrderRow = {
  orderNumber: string;
  subtotal: number;
  discountTotal: number;
  deliveryFee: number;
  total: number;
  deliveryMethod: string;
  shipCity: string | null;
  shipStreet: string | null;
  shipHouseNo: string | null;
  shipApartment: string | null;
  courierName: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  guestName: string | null;
  user: { name: string } | null;
  items: { titleSnap: string; quantity: number; priceSnap: number }[];
};

/**
 * One order and one event, rendered into everything that will be sent.
 *
 * Its own function so that the preview screen renders the identical bytes.
 * A preview built by a second code path is a preview that eventually shows
 * something the customer never receives, which is worse than no preview at
 * all.
 */
export function buildMessage(order: OrderRow, event: NotifyEvent): Message {
  const customerName = order.user?.name ?? order.guestName ?? "לקוח";
  const toCustomer = order.deliveryMethod === "DELIVERY";
  const trackUrl = `${SITE_URL}/track-order`;

  const message = messageFor(event, {
    orderNumber: order.orderNumber,
    customerName,
    total: order.total,
    deliveryToCustomer: toCustomer,
    courierName: order.courierName,
    trackingNumber: order.trackingNumber,
    trackingUrl: order.trackingUrl,
    trackUrl,
  });

  /* The same message laid out as a receipt. Built here rather than inside
     the email channel because a channel's job is to hand something to a
     provider, not to decide what the shop says. */
  message.html = renderOrderEmail(event, {
    orderNumber: order.orderNumber,
    customerName,
    subtotal: order.subtotal,
    discountTotal: order.discountTotal,
    deliveryFee: order.deliveryFee,
    total: order.total,
    deliveryToCustomer: toCustomer,
    address: shipAddress(order),
    items: order.items.map((i) => ({ title: i.titleSnap, quantity: i.quantity, price: i.priceSnap })),
    courierName: order.courierName,
    trackingNumber: order.trackingNumber,
    trackingUrl: order.trackingUrl,
    trackUrl,
  });

  return message;
}

/** The email exactly as it would go out, for the preview screen. */
export async function previewOrderEmail(
  orderNumber: string,
  event: NotifyEvent,
): Promise<string | null> {
  const order = await db.order.findUnique({ where: { orderNumber }, select: ORDER_SELECT });
  return order ? (buildMessage(order, event).html ?? null) : null;
}

/** The four address columns as one line, or nothing when they are all empty. */
function shipAddress(order: {
  shipStreet: string | null;
  shipHouseNo: string | null;
  shipApartment: string | null;
  shipCity: string | null;
}): string | null {
  const line = [
    order.shipStreet,
    order.shipHouseNo,
    order.shipApartment && `דירה ${order.shipApartment}`,
    order.shipCity,
  ]
    .filter(Boolean)
    .join(" ");
  return line || null;
}

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
export async function notifyOrder(
  orderId: string,
  event: NotifyEvent,
  /**
   * Send again even though this message already went.
   *
   * Only ever set by a person pressing "send again" on the order page. The
   * automatic senders never pass it, because the duplicate they would produce
   * is the accidental kind — a retried action, a redelivered callback — and
   * that is exactly what the unique index exists to stop. A deliberate resend
   * is a different act: somebody looked at the order, saw the customer never
   * got it, and decided.
   */
  { force = false }: { force?: boolean } = {},
): Promise<void> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: ORDER_SELECT,
  });
  if (!order) return;

  const email = order.user?.email ?? order.guestEmail ?? null;
  const phone = order.user?.phone ?? order.guestPhone ?? null;

  const message = buildMessage(order, event);

  for (const channel of CHANNELS) {
    const to = channel.id === "EMAIL" ? email : phone;

    // Claim the row before doing anything slow. A duplicate key here is not
    // an error condition, it is the answer: somebody already sent this.
    let claimed;
    if (force) {
      claimed = await db.orderNotification.upsert({
        where: { orderId_channel_event: { orderId: order.id, channel: channel.id, event } },
        create: { orderId: order.id, channel: channel.id, event, recipient: to },
        update: { recipient: to, status: "QUEUED", error: null, sentAt: null },
      });
    } else {
      try {
        claimed = await db.orderNotification.create({
          data: { orderId: order.id, channel: channel.id, event, recipient: to },
        });
      } catch {
        continue;
      }
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
