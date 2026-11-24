/**
 * The one place that speaks to the Meta pixel.
 *
 * Every call site goes through `trackMeta` rather than reaching for `fbq`
 * itself, for the same reason PUBLIC_PRODUCT_WHERE is a constant: an event
 * name or a currency written out at six call sites is an event name or a
 * currency that is wrong at one of them, and the failure is silent — Meta's
 * Events Manager shows a slightly smaller number, not an error.
 *
 * It sends nothing without consent, and nothing when the pixel was never
 * loaded — the normal state in development, in every preview build, and for
 * every visitor who has not agreed (see meta-pixel.tsx and lib/consent.ts).
 * No call site needs to know about any of that.
 */

import { consentGranted } from "@/lib/consent";
import { isNativeApp } from "@/lib/native-app";

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & {
      // Meta's own stub shape. callMethod is what the real library assigns to
      // itself once fbevents.js has loaded; until then calls go on the queue.
      callMethod?: (...args: unknown[]) => void;
      queue?: unknown[];
      loaded?: boolean;
      version?: string;
      push?: unknown;
    };
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
  | "Purchase"
  // leads, since the paid test of 30 October: a tap on the number or
  // WhatsApp, and a form that went through
  | "Contact"
  | "Lead";

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
  onSent?: () => void,
) {
  if (typeof window === "undefined") return;
  // Belt and braces: without consent the pixel was never loaded, so fbq is
  // undefined and this would no-op anyway. Checking anyway keeps the rule in
  // one readable place instead of resting on the absence of a global.
  if (!consentGranted()) return;
  // Same again for the app, where MetaPixel never mounts. The guard belongs
  // here as well as there because this is what the App Store declaration
  // promises, and a promise that holds only as long as nobody adds a call
  // site is not one worth making.
  if (isNativeApp()) return;
  /* THE PIXEL IS NOT THERE YET ON THE FIRST COMMIT OF A PAGE LOAD.

     Consent reads "unknown" while the server HTML hydrates and "granted" one
     render later, and MetaPixel (which installs window.fbq) only renders once
     it is granted. An event raised from a component's own mount effect — the
     purchase on the confirmation page above all, which is a full page load
     coming back from the gateway — therefore ran BEFORE fbq existed, did
     `window.fbq?.(...)`, and was dropped without a trace. PageView still
     arrived, because its effect lives inside MetaPixel; the Purchase never
     did, and Events Manager showed no Purchase at all for 28 days.

     So when fbq is missing, wait for it (it appears within a render or two)
     and send then. Not for ever: if it has not appeared after ~10 s, the
     pixel was never loaded on this page and the event is dropped as before.
     `onSent` runs only when the event was really handed to fbq, so a caller
     that remembers "already reported" does not remember a drop. */
  let triesLeft = 40;
  const attempt = () => {
    if (window.fbq) {
      window.fbq("track", name, params, eventID ? { eventID } : undefined);
      onSent?.();
      return;
    }
    if (--triesLeft > 0) setTimeout(attempt, 250);
  };
  attempt();
}
