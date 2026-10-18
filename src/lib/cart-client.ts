"use client";

import { addToCartAction } from "@/actions/cart";
import { META_CURRENCY, trackMeta } from "@/lib/analytics/meta";
import { pushEcommerce, toAnalyticsItem, itemsValue } from "@/lib/analytics/ga";

/**
 * The one way a page adds to the cart, with the reporting attached.
 *
 * Two components call the add action — the generic button on cards and in
 * the compare table, and the product page's purchase panel — and the
 * events used to live in only one of them. The product page is where most
 * adds happen, and its adds went unreported to Meta for as long as that
 * was so; GA4's add_to_cart was found missing in the browser probe the
 * day it was added. Reporting belongs on the mutation, not on each button.
 *
 * The event carries what was added NOW, at the price the server just
 * charged for it — the summary that comes back is priced by the server, so
 * the report says what happened rather than what the page displayed. Value
 * is price × the quantity added, never the basket total: an AddToCart
 * carrying the whole cart grows with every extra item and stops meaning
 * anything.
 */
export async function addToCartReported(productId: string, qty: number) {
  const summary = await addToCartAction(productId, qty);
  const line = summary.items.find((i) => i.productId === productId);
  if (line) {
    const items = [toAnalyticsItem(line, { quantity: qty })];
    pushEcommerce("add_to_cart", { value: itemsValue(items), items });
    trackMeta("AddToCart", {
      content_ids: [line.sku],
      contents: [{ id: line.sku, quantity: qty }],
      content_type: "product",
      value: line.price * qty,
      currency: META_CURRENCY,
      num_items: qty,
    });
  }
  return summary;
}
