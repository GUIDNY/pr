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

export function maxCartQuantity(stockQty: number) {
  return Math.max(1, Math.min(stockQty, 10));
}

export function planCartMerge(
  guestItems: { productId: string; quantity: number }[],
  userItems: { id: string; productId: string; quantity: number }[],
  stock: Map<string, number>,
): CartMergePlan {
  const plan: CartMergePlan = { updates: [], creates: [] };

  for (const item of guestItems) {
    const stockQty = stock.get(item.productId);
    // The product was deleted, or is no longer sellable, while the cart sat
    // there. Nothing to merge, and nothing to report — it is already gone from
    // the guest's own view of the cart.
    if (stockQty === undefined) continue;

    const maxQty = maxCartQuantity(stockQty);
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
