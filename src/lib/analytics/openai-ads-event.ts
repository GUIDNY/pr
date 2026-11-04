import { createHash } from "node:crypto";
import { waNumber } from "@/lib/notify/whatsapp-link";

/**
 * The purchase, as OpenAI Ads' Conversions API wants it.
 *
 * No database and no network here, so check:openai-ads can assert every
 * field. The sender is openai-ads-purchase.ts.
 *
 * Built from the official reference (developers.openai.com/ads/
 * conversions-api), read on 4 November, and NOT from the spec the shop was
 * handed that day. That spec was measured in a browser without the code, and
 * three of its details would each have failed silently:
 *
 *   - the user fields are `emails_sha256`, `phone_numbers_sha256` and
 *     `external_ids_sha256`, lists of hashes we compute — not `email`,
 *     `phone` and `external_id` in the clear;
 *   - the funnel events are `contents_viewed`, `items_added` and
 *     `checkout_started`, not GA4's `view_item`, `add_to_cart` and
 *     `begin_checkout`;
 *   - `amount` is an integer in minor units — agorot — not shekels.
 *
 * DEDUPLICATION. The browser already reports this purchase: GTM container
 * GTM-5Z82SD4Z holds a Custom HTML tag that sends `order_created` with
 * `event_id: String(ecommerce.transaction_id)`, and transaction_id is the
 * order number (components/analytics/ga-events.tsx). OpenAI deduplicates on
 * pixel, event type and id, keeping the first, so `id` here is the order
 * number and `type` is `order_created` — the two reports become one.
 *
 * `amount` follows the same convention as that tag and as every GA4 event in
 * this codebase: the goods after discount, never delivery. A disagreement
 * would not be a duplicate, it would be two numbers for one sale.
 */

export const OPENAI_ADS_EVENTS_URL = "https://bzr.openai.com/v1/events";

const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

/** Trim and lowercase, then hash. Null for anything that is not an address. */
export function hashEmail(email: string | null | undefined): string | null {
  const e = (email ?? "").trim().toLowerCase();
  return e.includes("@") ? sha256(e) : null;
}

/**
 * Country code kept, then the documented normalisation: no separators, no
 * leading `+`, no leading zeros, 8–15 digits.
 *
 * The documented rule cannot be applied to an Israeli number as customers
 * type it. "052-123-4567" has no country code, and stripping the leading zero
 * would hash "521234567" — a number in no country, which matches no one and
 * reports nothing wrong. So the number goes through waNumber first, the same
 * conversion the WhatsApp links use: 0XX… becomes 972XX…, and anything it does
 * not recognise is null rather than a guess.
 */
export function hashPhone(phone: string | null | undefined): string | null {
  const intl = waNumber(phone);
  if (!intl) return null;
  const digits = intl.replace(/^0+/, "");
  return /^\d{8,15}$/.test(digits) ? sha256(digits) : null;
}

/** Trim only; case is kept, as the reference says. */
export function hashExternalId(id: string | null | undefined): string | null {
  const v = (id ?? "").trim();
  return v ? sha256(v) : null;
}

/** ₪1,234.50 → 123450. Rounded, because Float arithmetic leaves 123449.99999. */
export const toAgorot = (shekels: number) => Math.round(shekels * 100);

export type PurchaseForOpenAi = {
  orderNumber: string;
  subtotal: number;
  discountTotal: number;
  email: string | null;
  phone: string | null;
  userId: string | null;
  items: { sku: string; title: string; price: number; quantity: number }[];
};

export function openAiPurchaseEvent(order: PurchaseForOpenAi, siteUrl: string, nowMs: number) {
  const emails = [hashEmail(order.email)].filter((v): v is string => !!v);
  const phones = [hashPhone(order.phone)].filter((v): v is string => !!v);
  const externals = [hashExternalId(order.userId)].filter((v): v is string => !!v);

  const user: Record<string, string[]> = {};
  if (emails.length) user.emails_sha256 = emails;
  if (phones.length) user.phone_numbers_sha256 = phones;
  if (externals.length) user.external_ids_sha256 = externals;

  return {
    id: order.orderNumber,
    type: "order_created" as const,
    timestamp_ms: nowMs,
    action_source: "web" as const,
    source_url: `${siteUrl.replace(/\/$/, "")}/checkout/success`,
    opt_out: false,
    ...(Object.keys(user).length ? { user } : {}),
    data: {
      type: "contents" as const,
      amount: toAgorot(order.subtotal - order.discountTotal),
      currency: "ILS",
      contents: order.items.map((i) => ({
        id: i.sku,
        name: i.title,
        content_type: "product",
        quantity: i.quantity,
        amount: toAgorot(i.price),
        currency: "ILS",
      })),
    },
  };
}
