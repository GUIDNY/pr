import { createHash } from "node:crypto";

/**
 * The pure half of the Meta Conversions API report (meta-capi.ts): what is
 * read from the browser, how a person's details are normalised and hashed,
 * and the payload that goes out. No I/O, so scripts/check-meta-capi.ts can
 * test it without a database.
 *
 * Consent is the line this file holds. Nothing about a person leaves the
 * server unless the order says the visitor agreed to be measured
 * (`metaConsent`, written at checkout from the same banner the pixel obeys).
 */

export const META_CAPI_VERSION = "v21.0";
/** The shop's pixel — the same one the browser loads. */
export const META_PIXEL_FALLBACK_ID = "2216479452236195";
export const META_CAPI_SOURCE_URL = "https://buytoday.co.il/checkout";

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Meta: trim, lower-case, then hash. Null for anything that is not an address. */
export function hashEmail(email: string | null | undefined): string | null {
  const e = (email ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? sha256(e) : null;
}

/** Meta: digits only, with the country code and no leading zero. Israeli
    numbers: 05x… and +9725x… both become 9725x…; anything else is not sent. */
export function hashPhone(phone: string | null | undefined): string | null {
  let d = (phone ?? "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("972")) d = d.slice(3);
  if (d.startsWith("0")) d = d.slice(1);
  return /^5\d{8}$|^[2-4689]\d{7}$/.test(d) ? sha256(`972${d}`) : null;
}

export type CapiOrder = {
  orderNumber: string;
  total: number;
  createdAt: Date;
  metaConsent: boolean;
  metaFbp: string | null;
  metaFbc: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  items: { skuSnap: string; quantity: number }[];
};

/** The Purchase event. event_id is the order number — the browser's pixel
    sends the same one, which is how Meta counts the sale once. */
export function buildCapiPurchase(order: CapiOrder, now: Date = new Date()) {
  const user: Record<string, string[] | string> = {};
  const em = hashEmail(order.guestEmail);
  const ph = hashPhone(order.guestPhone);
  if (em) user.em = [em];
  if (ph) user.ph = [ph];
  if (order.metaFbp) user.fbp = order.metaFbp;
  if (order.metaFbc) user.fbc = order.metaFbc;
  return {
    event_name: "Purchase",
    event_id: order.orderNumber,
    // Meta rejects an event older than seven days; the order's own time is
    // the honest one while it is recent, "now" otherwise.
    event_time: Math.floor((now.getTime() - order.createdAt.getTime() < 6 * 86_400_000 ? order.createdAt : now).getTime() / 1000),
    action_source: "website",
    event_source_url: META_CAPI_SOURCE_URL,
    user_data: user,
    custom_data: {
      value: Number(order.total.toFixed(2)),
      currency: "ILS",
      content_ids: order.items.map((i) => i.skuSnap),
      content_type: "product",
      contents: order.items.map((i) => ({ id: i.skuSnap, quantity: i.quantity })),
      num_items: order.items.reduce((n, i) => n + i.quantity, 0),
    },
  };
}
