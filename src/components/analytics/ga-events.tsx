"use client";

import { useEffect, useRef } from "react";
import { pushEcommerce, toAnalyticsItem, itemsValue, type AnalyticsProduct } from "@/lib/analytics/ga";
import { PAYMENT_CAPTURED_EVENT } from "@/components/analytics/meta-events";

/**
 * The GA4 ecommerce events, one small client component each, rendered by
 * the page that knows the numbers — the same shape as meta-events.tsx, for
 * the same reason: a server component can report an event without
 * becoming a client component.
 */

/** A shopper looked at a product page. Keyed to the SKU, so a navigation
    from one product to the next fires again. */
export function GaViewItem({ product }: { product: AnalyticsProduct }) {
  const sent = useRef<string | null>(null);
  useEffect(() => {
    if (sent.current === product.sku) return;
    sent.current = product.sku;
    const items = [toAnalyticsItem(product)];
    pushEcommerce("view_item", { value: itemsValue(items), items });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.sku]);
  return null;
}

/** A list of products was shown — a category page, a search, a carousel.
    One event per rendered page of results, with 1-based positions. */
export function GaViewItemList({
  listId,
  listName,
  products,
}: {
  listId: string;
  listName: string;
  products: AnalyticsProduct[];
}) {
  const key = `${listId}:${products.map((p) => p.sku).join(",")}`;
  const sent = useRef<string | null>(null);
  useEffect(() => {
    if (products.length === 0 || sent.current === key) return;
    sent.current = key;
    pushEcommerce("view_item_list", {
      item_list_id: listId,
      item_list_name: listName,
      items: products.map((p, i) => toAnalyticsItem(p, { index: i + 1, item_list_name: listName })),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}

/** The checkout opened with a cart. Once per mount. */
export function GaBeginCheckout({
  lines,
  coupon,
}: {
  lines: (AnalyticsProduct & { quantity: number })[];
  coupon?: string | null;
}) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current || lines.length === 0) return;
    sent.current = true;
    const items = lines.map((l) => toAnalyticsItem(l, { quantity: l.quantity }));
    pushEcommerce("begin_checkout", {
      value: itemsValue(items),
      ...(coupon ? { coupon } : {}),
      items,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

const purchaseKey = (orderNumber: string) => `prec-ga-purchase:${orderNumber}`;

/**
 * A completed purchase — and only one, and only once.
 *
 * Same three guards as MetaPurchase, which this stands beside on the
 * confirmation page: the page is a plain URL that gets reloaded and
 * revisited (localStorage, keyed by order number); a gateway order arrives
 * here before the callback settles it (wait for PAYMENT_CAPTURED_EVENT);
 * a cash or pickup order is complete on arrival (`captured` on mount).
 *
 * transaction_id is the order number — real, unique, and the same id the
 * server-side report (lib/analytics/ga4-purchase.ts) uses, so GA4 counts
 * the two as one. `value` is the goods after discount; delivery is
 * `shipping`, apart — the convention lib/analytics/ga.ts states.
 */
export function GaPurchase({
  orderNumber,
  captured,
  lines,
  discount,
  shipping,
  coupon,
}: {
  orderNumber: string;
  captured: boolean;
  lines: (AnalyticsProduct & { quantity: number })[];
  discount: number;
  shipping: number;
  coupon?: string | null;
}) {
  useEffect(() => {
    const send = () => {
      try {
        if (window.localStorage.getItem(purchaseKey(orderNumber)) === "1") return;
      } catch {
        /* storage blocked: report once and risk a duplicate on reload */
      }
      const items = lines.map((l) => toAnalyticsItem(l, { quantity: l.quantity }));
      const pushed = pushEcommerce("purchase", {
        transaction_id: orderNumber,
        value: Math.round((itemsValue(items) - discount) * 100) / 100,
        shipping: Math.round(shipping * 100) / 100,
        ...(coupon ? { coupon } : {}),
        items,
      });
      if (!pushed) return;
      try {
        window.localStorage.setItem(purchaseKey(orderNumber), "1");
      } catch {
        /* see above */
      }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderNumber, captured]);
  return null;
}
