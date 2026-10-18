import { consentGranted } from "@/lib/consent";
import { isNativeApp } from "@/lib/native-app";

/**
 * GA4 ecommerce, through the dataLayer that GTM container GTM-5Z82SD4Z
 * reads (its five event tags have "Send Ecommerce data → Data Layer").
 *
 * One function pushes every event, for three reasons the consultant's brief
 * spells out and one it does not:
 *   - `ecommerce: null` is pushed first, every time. Without it GTM merges
 *     the previous event's items into this one, and an add_to_cart of one
 *     product reports two. The single most common bug in these setups.
 *   - prices are numbers, per unit, after discount, in ILS. Never a string,
 *     never "1,629 ₪". The mapper below is the only place an item is built.
 *   - item_id is the SKU — the same field the Merchant Center feed sends as
 *     g:id (lib/feeds/google-merchant.ts), so a product that was advertised
 *     and a product that sold are the same product to Google.
 *   - and nothing is pushed before consent, or inside the iOS app: the same
 *     rule trackMeta keeps. GTM is not even loaded until the visitor says
 *     yes (components/analytics/google-tag-manager.tsx), so a push before
 *     that would only queue — but a queue GTM later drains is a record of a
 *     visit the person had not yet agreed to measure.
 *
 * VALUE CONVENTION, kept the same on every event: `value` is the goods —
 * Σ(price × quantity) after discounts — and never includes delivery. On
 * purchase the delivery fee goes in `shipping`, separately. Delivery is
 * free above ₪600 here, so folding it in would make value jump by ₪40 at
 * the threshold for no change in what was sold.
 */

export const GA_CURRENCY = "ILS";

export type AnalyticsItem = {
  item_id: string;
  item_name: string;
  price: number;
  quantity: number;
  item_category?: string;
  item_category2?: string;
  item_brand?: string;
  discount?: number;
  index?: number;
  item_list_name?: string;
};

export type EcommercePayload = {
  currency?: typeof GA_CURRENCY;
  value?: number;
  items: AnalyticsItem[];
  [k: string]: unknown;
};

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

/** What every surface already has for a product: the card, the product
    page, a cart line, an order line. */
export type AnalyticsProduct = {
  sku: string;
  title: string;
  /** Per unit, after discount — what the shop charges. */
  price: number;
  /** The struck-through list price, when the product is discounted. */
  compareAtPrice?: number | null;
  brandName?: string | null;
  category?: string | null;
  category2?: string | null;
};

const money = (n: number) => Math.round(n * 100) / 100;

export function toAnalyticsItem(
  p: AnalyticsProduct,
  opts: { quantity?: number; index?: number; item_list_name?: string } = {},
): AnalyticsItem {
  const item: AnalyticsItem = {
    item_id: p.sku,
    item_name: p.title,
    price: money(p.price),
    quantity: opts.quantity ?? 1,
  };
  if (p.brandName) item.item_brand = p.brandName;
  if (p.category) item.item_category = p.category;
  if (p.category2) item.item_category2 = p.category2;
  if (p.compareAtPrice && p.compareAtPrice > p.price) item.discount = money(p.compareAtPrice - p.price);
  if (opts.index !== undefined) item.index = opts.index;
  if (opts.item_list_name) item.item_list_name = opts.item_list_name;
  return item;
}

/** Σ(price × quantity), to the agora. */
export function itemsValue(items: AnalyticsItem[]): number {
  return money(items.reduce((sum, i) => sum + i.price * i.quantity, 0));
}

export function pushEcommerce(event: string, ecommerce: EcommercePayload): boolean {
  if (typeof window === "undefined") return false;
  if (!consentGranted() || isNativeApp()) return false;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ ecommerce: null });
  window.dataLayer.push({ event, ecommerce: { currency: GA_CURRENCY, ...ecommerce } });
  return true;
}

/**
 * GA4's own identity for this browser, read from its cookies, so a purchase
 * reported from the server (lib/analytics/ga4-purchase.ts) carries the
 * same client_id as the browser's and GA4 deduplicates the two by
 * transaction_id instead of counting the sale twice. Both are null with
 * no consent — GA4 never ran, there is no cookie — and the server then
 * reports under a synthetic id: counted, unattributed, which is all that
 * can honestly be said of a visit that refused measurement.
 *
 *   _ga            GA1.1.<client_id>
 *   _ga_<STREAM>   GS1.1.<session_id>.<n>.…   (stream = the G- id's tail)
 */
export function readGaIds(measurementId: string | undefined): { clientId: string | null; sessionId: string | null } {
  if (typeof document === "undefined") return { clientId: null, sessionId: null };
  const cookies = new Map<string, string>();
  for (const part of document.cookie.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0) cookies.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
  }
  const ga = cookies.get("_ga");
  const clientId = ga ? (ga.match(/^GA\d+\.\d+\.(\d+\.\d+)$/)?.[1] ?? null) : null;
  const stream = measurementId?.replace(/^G-/, "");
  const gs = stream ? cookies.get(`_ga_${stream}`) : undefined;
  const sessionId = gs ? (gs.match(/^GS\d+\.\d+\.(\d+)\./)?.[1] ?? null) : null;
  return { clientId, sessionId };
}
