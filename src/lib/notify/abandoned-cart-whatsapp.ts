import "server-only";
import { db } from "@/lib/db";
import { whatsappChannel, whatsappRecipient } from "@/lib/notify/channels";

/**
 * One WhatsApp message to a customer who left the checkout: "is everything
 * all right, need a hand?" — sent once per cart, and only to someone who
 * ticked the advertising-consent box.
 *
 * Why the consent box and not the WhatsApp box: Meta files an abandoned-cart
 * reminder under Marketing and so does section 30א of the Communications
 * Law. The "updates on WhatsApp" box is pre-ticked and promises order
 * updates; a cart that was never ordered has no order to update.
 *
 * Why at most once:
 * - The claim (waReminderSentAt) is written BEFORE the send, with a
 *   conditional update, so two overlapping cron runs cannot both send.
 * - A failed send keeps its claim and its reason. Retrying a reminder that
 *   Meta refused is how a customer gets three of them.
 * - A phone reminded in the last REPEAT_DAYS is skipped even on a new cart,
 *   so "once" means once to the person, not once per cart row.
 * - A phone that answered "הסר" (WhatsappOptOut) is never sent marketing
 *   again, whatever a later checkbox says.
 *
 * Off until ABANDONED_CART_WHATSAPP=1: the template has to be approved in
 * WhatsApp Manager first, and every send before that would be a refusal that
 * burns the cart's one chance.
 */

// The same settle time as the call list: someone still typing an address is
// mid-purchase, not gone.
export const SETTLE_MINUTES = 30;
// Past a day the reminder is about a cart the customer has forgotten, and
// reads as tracking rather than help.
export const MAX_AGE_HOURS = 24;
export const REPEAT_DAYS = 7;
// One run sends at most this many — a backlog after switching it on goes out
// over a few runs instead of in one burst.
const BATCH = 25;

export function abandonedCartWhatsappEnabled(): boolean {
  return process.env.ABANDONED_CART_WHATSAPP === "1";
}

function firstName(fullName: string | null): string {
  const first = (fullName ?? "").trim().split(/\s+/)[0] ?? "";
  // Meta refuses an empty slot; a greeting without a name still reads fine.
  return first.slice(0, 40) || "שם";
}

export async function sendAbandonedCartReminders() {
  if (!abandonedCartWhatsappEnabled()) return { enabled: false, sent: 0, failed: 0, skipped: 0 };
  if (!whatsappChannel.configured()) return { enabled: true, sent: 0, failed: 0, skipped: 0, error: "whatsapp not configured" };

  const now = Date.now();
  const candidates = await db.cart.findMany({
    where: {
      marketingOptIn: true,
      waReminderSentAt: null,
      contactPhone: { not: null },
      contactAt: {
        lt: new Date(now - SETTLE_MINUTES * 60 * 1000),
        gt: new Date(now - MAX_AGE_HOURS * 60 * 60 * 1000),
      },
      items: { some: {} },
    },
    select: { id: true, contactName: true, contactPhone: true, contactAt: true },
    orderBy: { contactAt: "asc" },
    take: BATCH * 2,
  });

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const phonesThisRun = new Set<string>();

  for (const cart of candidates) {
    if (sent + failed >= BATCH) break;
    const recipient = whatsappRecipient(cart.contactPhone ?? "");
    if (!recipient || phonesThisRun.has(recipient)) {
      skipped++;
      continue;
    }

    const local = "0" + recipient.slice(3);
    const [optedOut, recentlyReminded, orderedSince] = await Promise.all([
      db.whatsappOptOut.findUnique({ where: { phone: recipient }, select: { phone: true } }),
      db.cart.findFirst({
        where: {
          id: { not: cart.id },
          waReminderSentAt: { gt: new Date(now - REPEAT_DAYS * 24 * 60 * 60 * 1000) },
          contactPhone: { in: [recipient, "+" + recipient, local] },
        },
        select: { id: true },
      }),
      // Bought on another cart (another device, or signed in) after leaving
      // this one: the reminder would be about something already ordered.
      db.order.findFirst({
        where: {
          createdAt: { gte: cart.contactAt ?? new Date(0) },
          // The last nine digits match 050-…, 972-50-… and +972 50 … alike.
          guestPhone: { contains: recipient.slice(-7) },
        },
        select: { id: true },
      }),
    ]);

    if (optedOut || recentlyReminded || orderedSince) {
      // Claimed as handled so it is not re-checked every quarter hour.
      await db.cart.updateMany({
        where: { id: cart.id, waReminderSentAt: null },
        data: {
          waReminderSentAt: new Date(),
          waReminderError: optedOut ? "skipped: opted out" : recentlyReminded ? "skipped: reminded recently" : "skipped: ordered since",
        },
      });
      skipped++;
      continue;
    }

    const claim = await db.cart.updateMany({
      where: { id: cart.id, waReminderSentAt: null },
      data: { waReminderSentAt: new Date() },
    });
    if (claim.count !== 1) {
      skipped++;
      continue;
    }
    phonesThisRun.add(recipient);

    const name = firstName(cart.contactName);
    const result = await whatsappChannel.send(recipient, {
      subject: "תזכורת עגלה",
      body: `היי ${name}, ראינו שהתחלת הזמנה ב-Buy Today ולא סיימת. הכל בסדר?`,
      template: { event: "ABANDONED_CART", params: [name] },
    });

    if (result.ok) {
      sent++;
      if (result.providerMessageId) {
        await db.cart.update({ where: { id: cart.id }, data: { waReminderError: `sent: ${result.providerMessageId}` } });
      }
    } else {
      failed++;
      await db.cart.update({ where: { id: cart.id }, data: { waReminderError: result.error.slice(0, 500) } });
    }
  }

  return { enabled: true, sent, failed, skipped };
}

/** "הסר": records the opt-out and withdraws the account's consent if there is one. */
export async function optOutWhatsappMarketing(phone: string) {
  const recipient = whatsappRecipient(phone);
  if (!recipient) return { ok: false as const };
  const local = "0" + recipient.slice(3);
  await db.whatsappOptOut.upsert({ where: { phone: recipient }, create: { phone: recipient }, update: {} });
  const users = await db.user.updateMany({
    where: { marketingOptIn: true, phone: { in: [recipient, "+" + recipient, local] } },
    data: { marketingOptIn: false, marketingOptInAt: null },
  });
  await db.cart.updateMany({
    where: { marketingOptIn: true, contactPhone: { in: [recipient, "+" + recipient, local] } },
    data: { marketingOptIn: false, marketingOptInAt: null },
  });
  return { ok: true as const, usersUpdated: users.count };
}
