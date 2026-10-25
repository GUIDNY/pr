import { sourceSellsFromStockOnly } from "@/lib/inventory/availability";

/**
 * What a merge would do, worked out without touching the database.
 *
 * Separated from claimGuestCart for one reason: this database cannot be
 * reached from the environments these agents run in, so anything that needs a
 * connection to be checked does not get checked. The arithmetic is where this
 * can go wrong — a quantity that doubles, a cap that is not applied, a product
 * that vanished while the cart sat there — and scripts/check-cart-merge.ts
 * runs every one of those cases in a second with no connection at all.
 *
 * The cap is the one addToCartAction applies, restated here rather than
 * imported, because that file is a "use server" module and importing it into a
 * test script pulls a server action into a plain node process. If the cap ever
 * moves, the check script fails on the pair being different, which is the
 * point.
 */
export type CartMergePlan = {
  updates: { itemId: string; quantity: number }[];
  creates: { productId: string; quantity: number }[];
};

/** Most of any one product a single cart may hold. */
export const CART_LINE_CAP = 10;

/**
 * The cap on one cart line.
 *
 * `max(1, min(stockQty, 10))` was written out by hand in five places — the
 * add action, the update action, the merge, the cart summary and the product
 * page — which is how a rule like this rots: one copy learns something and
 * four keep the old behaviour. It learned something on 19 October.
 *
 * A product drawn from the supplier carries a stockQty of zero and is sellable
 * anyway, and the old formula caps it at one unit: a customer could buy a
 * single cooktop and not two. The owner's instruction is that such a product
 * behaves exactly like a stocked one, so for those the cap is the flat line
 * limit and stock does not enter into it.
 *
 * A product the price list has marked gone is the opposite case and needs no
 * special handling: there stock on hand is the real limit, which is what the
 * original formula already says.
 */
/* And a third input since 25 October, for the same reason the gate grew one:
   the electronics workbook is sold from the shelf, so there "drawn from the
   supplier" does not apply and the units on hand are the cap again. Required
   rather than optional, so a call site that does not know which price list a
   product came from cannot quietly get the generous answer. */
export function maxCartQuantity(
  stockQty: number,
  sourceAvailability: string | null | undefined,
  sourceKey: string | null | undefined,
) {
  /* Only an explicit ORDERABLE lifts the cap, which is this function's own
     reading and deliberately not isSellableNow's: there a missing value means
     "never came from a price list" and is treated as orderable, while a cart
     line with nothing known about it is the case where the cautious answer is
     the right one. check:cart holds both. */
  if (sourceAvailability === "ORDERABLE" && !sourceSellsFromStockOnly(sourceKey)) return CART_LINE_CAP;
  return Math.max(1, Math.min(stockQty, CART_LINE_CAP));
}

export function planCartMerge(
  guestItems: { productId: string; quantity: number }[],
  userItems: { id: string; productId: string; quantity: number }[],
  stock: Map<string, { qty: number; availability?: string | null; sourceKey?: string | null }>,
): CartMergePlan {
  const plan: CartMergePlan = { updates: [], creates: [] };

  for (const item of guestItems) {
    const entry = stock.get(item.productId);
    // The product was deleted, or is no longer sellable, while the cart sat
    // there. Nothing to merge, and nothing to report — it is already gone from
    // the guest's own view of the cart.
    if (entry === undefined) continue;

    const maxQty = maxCartQuantity(entry.qty, entry.availability, entry.sourceKey);
    const mine = userItems.find((i) => i.productId === item.productId);

    if (!mine) {
      plan.creates.push({ productId: item.productId, quantity: Math.min(item.quantity, maxQty) });
      continue;
    }

    /* Added, not replaced: two of something in one cart and one in the other
       is three of it, the same as if they had pressed "add" three times. The
       cap then does what it does everywhere else. */
    const nextQty = Math.min(mine.quantity + item.quantity, maxQty);
    if (nextQty !== mine.quantity) plan.updates.push({ itemId: mine.id, quantity: nextQty });
  }

  return plan;
}
