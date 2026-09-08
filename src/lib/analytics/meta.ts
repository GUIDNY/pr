/**
 * The one place that speaks to the Meta pixel.
 *
 * Every call site goes through `trackMeta` rather than reaching for `fbq`
 * itself, for the same reason PUBLIC_PRODUCT_WHERE is a constant: an event
 * name or a currency written out at six call sites is an event name or a
 * currency that is wrong at one of them, and the failure is silent — Meta's
 * Events Manager shows a slightly smaller number, not an error.
 *
 * It no-ops when the pixel was never loaded, which is the normal state in
 * development and in every preview build (see meta-pixel.tsx). Nothing here
 * needs to know whether measurement is switched on.
 */

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & { queue?: unknown[]; loaded?: boolean };
    _fbq?: unknown;
  }
}

/** The shop sells in shekels and nothing else. Meta wants ISO-4217. */
export const META_CURRENCY = "ILS";

/**
 * The identifier a product is known by, everywhere it is reported outside
 * this site.
 *
 * It is the SKU, and it has to stay the SKU: `g:id` in the Google Merchant
 * feed is `Product.sku` (see lib/feeds/google-merchant.ts), a Meta catalog
 * built from that same feed therefore keys on the SKU, and a pixel reporting
 * anything else — the cuid, the slug — matches nothing in the catalog. Meta
 * does not report that as an error either; the events simply never attribute
 * to a product.
 */
export type MetaContentId = string;

export type MetaEventName =
  | "ViewContent"
  | "Search"
  | "AddToCart"
  | "InitiateCheckout"
  | "Purchase";

export type MetaEventParams = {
  value?: number;
  currency?: string;
  content_ids?: MetaContentId[];
  content_type?: "product";
  content_name?: string;
  contents?: { id: MetaContentId; quantity: number }[];
  num_items?: number;
  search_string?: string;
};

/**
 * Send one event.
 *
 * `eventID` is not optional decoration. If a server-side Conversions API is
 * ever added alongside this pixel, Meta deduplicates a browser event against
 * a server event only when both carry the same event name and the same
 * eventID — without it the same purchase is counted twice, and a doubled
 * revenue number is worse than no number. So every event that has a natural
 * stable identity (an order number, above all) passes one.
 */
export function trackMeta(
  name: MetaEventName,
  params: MetaEventParams,
  eventID?: string,
) {
  if (typeof window === "undefined") return;
  window.fbq?.("track", name, params, eventID ? { eventID } : undefined);
}
