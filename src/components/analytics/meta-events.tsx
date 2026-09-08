"use client";

import { useEffect, useRef } from "react";
import { META_CURRENCY, trackMeta, type MetaContentId } from "@/lib/analytics/meta";

/**
 * The commerce events, one small client component each, rendered by the page
 * that actually knows the numbers.
 *
 * They render nothing. Keeping them as components rather than hooks is what
 * lets a server component — the product page, the search page, the order
 * confirmation — report an event without becoming a client component itself
 * and dragging its whole subtree into the browser bundle.
 */

/** A shopper looked at a product page. */
export function MetaViewContent({
  sku,
  price,
  title,
}: {
  sku: MetaContentId;
  price: number;
  title: string;
}) {
  const sent = useRef<string | null>(null);
  useEffect(() => {
    if (sent.current === sku) return;
    sent.current = sku;
    trackMeta("ViewContent", {
      content_ids: [sku],
      content_type: "product",
      content_name: title,
      value: price,
      currency: META_CURRENCY,
    });
  }, [sku, price, title]);
  return null;
}

/** A shopper searched. Sent with the results, not with every keystroke. */
export function MetaSearch({
  query,
  resultSkus,
}: {
  query: string;
  resultSkus: MetaContentId[];
}) {
  const sent = useRef<string | null>(null);
  useEffect(() => {
    if (!query.trim()) return;
    if (sent.current === query) return;
    sent.current = query;
    trackMeta("Search", {
      search_string: query,
      content_ids: resultSkus,
      content_type: "product",
    });
    // resultSkus is derived from the query, so it is deliberately not a
    // dependency: including it would re-fire on any re-render that rebuilt
    // the array, which is every one of them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);
  return null;
}

/** A shopper opened the checkout with a cart. */
export function MetaInitiateCheckout({
  value,
  contents,
}: {
  value: number;
  contents: { id: MetaContentId; quantity: number }[];
}) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current || contents.length === 0) return;
    sent.current = true;
    trackMeta("InitiateCheckout", {
      value,
      currency: META_CURRENCY,
      content_ids: contents.map((c) => c.id),
      contents,
      content_type: "product",
      num_items: contents.reduce((n, c) => n + c.quantity, 0),
    });
  }, [value, contents]);
  return null;
}

/** The name of the window event PaymentConfirmation fires once a gateway
 *  payment is confirmed. Declared here because both sides need it. */
export const PAYMENT_CAPTURED_EVENT = "prec:payment-captured";

const purchaseKey = (orderNumber: string) => `prec-meta-purchase:${orderNumber}`;

/**
 * A completed purchase — and only a completed one.
 *
 * Three separate things could otherwise report a sale that did not happen,
 * and each one has really occurred on this site:
 *
 *  - The confirmation page is a plain URL. Anyone can open it, reload it, or
 *    come back to it from their history a week later, and a naive fire-on-
 *    mount would count a purchase every time. Hence the localStorage guard,
 *    which survives the reload the way a ref does not.
 *  - A Pelecard order reaches this page before Pelecard's server-side callback
 *    does. At first render its payment is genuinely PENDING and may yet fail,
 *    so `captured` is false and nothing is sent; PaymentConfirmation polls,
 *    and when it settles on CAPTURED it fires PAYMENT_CAPTURED_EVENT and this
 *    listens for it. A payment that fails never fires it, so nothing is sent.
 *  - Cash and pickup orders have no gateway at all and are complete on
 *    arrival, which is what `captured` being true on mount means.
 *
 * eventID is the order number: stable, unique, and already the identity a
 * server-side Conversions API event would carry, so the two deduplicate
 * against each other instead of doubling the revenue.
 */
export function MetaPurchase({
  orderNumber,
  captured,
  value,
  contents,
}: {
  orderNumber: string;
  captured: boolean;
  value: number;
  contents: { id: MetaContentId; quantity: number }[];
}) {
  useEffect(() => {
    const send = () => {
      try {
        if (window.localStorage.getItem(purchaseKey(orderNumber)) === "1") return;
        window.localStorage.setItem(purchaseKey(orderNumber), "1");
      } catch {
        // Storage blocked (private window, blocked site data). Reporting the
        // sale once and risking a duplicate on a reload is the better failure
        // than never reporting it at all.
      }
      trackMeta(
        "Purchase",
        {
          value,
          currency: META_CURRENCY,
          content_ids: contents.map((c) => c.id),
          contents,
          content_type: "product",
          num_items: contents.reduce((n, c) => n + c.quantity, 0),
        },
        orderNumber,
      );
    };

    if (captured) {
      send();
      return;
    }

    const onCaptured = (e: Event) => {
      const detail = (e as CustomEvent<{ orderNumber: string }>).detail;
      if (detail?.orderNumber === orderNumber) send();
    };
    window.addEventListener(PAYMENT_CAPTURED_EVENT, onCaptured);
    return () => window.removeEventListener(PAYMENT_CAPTURED_EVENT, onCaptured);
  }, [orderNumber, captured, value, contents]);

  return null;
}
