import { db } from "@/lib/db";

/**
 * A cart that has already been paid for.
 *
 * Until now the cart was emptied in one place only: the confirmation page,
 * once it had polled the payment through. A customer who left before that —
 * pressed back, or returned to /checkout on their own — found the items still
 * there, and the checkout, which opens a payment by itself once the details
 * are complete, made them a second order for the same things. PR-280912 on
 * 6 November is that, 88 seconds after PR-810952 was paid.
 *
 * Two halves, for the two ways it can still slip:
 *
 * - emptyPaidOrderFromCart() runs in Pelecard's server-side callback, the
 *   moment the payment is confirmed, so the cart is empty whatever the
 *   browser does next.
 * - findRecentlyPaidOrder() is asked before a new order is created, for the
 *   case the first half cannot reach (a cart it could not find, or a callback
 *   that is late): the same visit or account paid for exactly these items in
 *   the last half hour, so the answer is "already paid", not a new order.
 */

import { matchPaidOrder, PAID_RECENTLY_MS, SETTLED_PAYMENT_STATUSES, type Line } from "@/lib/paid-cart-rules";

export { matchPaidOrder, sameItems, PAID_RECENTLY_MS, SETTLED_PAYMENT_STATUSES } from "@/lib/paid-cart-rules";

/**
 * The order this basket was just paid as, for this account or this visit.
 * Nothing to look up without either, and nothing is guessed.
 */
export async function findRecentlyPaidOrder(params: {
  userId?: string | null;
  visitSid?: string | null;
  items: Line[];
}): Promise<string | null> {
  const who = [
    ...(params.userId ? [{ userId: params.userId }] : []),
    ...(params.visitSid ? [{ visitSid: params.visitSid }] : []),
  ];
  if (who.length === 0 || params.items.length === 0) return null;
  const now = new Date();
  const orders = await db.order.findMany({
    where: {
      OR: who,
      paymentStatus: { in: [...SETTLED_PAYMENT_STATUSES] },
      createdAt: { gte: new Date(now.getTime() - PAID_RECENTLY_MS) },
      deletedAt: null,
    },
    select: {
      orderNumber: true,
      paymentStatus: true,
      createdAt: true,
      items: { select: { productId: true, quantity: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  return matchPaidOrder(params.items, orders, now);
}

/**
 * Takes a paid order's products out of the cart it was placed from.
 *
 * The callback has no browser cookie, so the cart is found the way the
 * declined-card note finds it: the account's own cart for a signed-in order,
 * otherwise the cart of the visit that placed it. Only the order's own
 * products are removed — something added to the cart after the order was
 * made stays — and the checkout contact is cleared only once nothing is left,
 * so a paid customer is not on the abandoned-checkout list.
 *
 * Never throws: the payment is recorded before this runs, and an emptied
 * cart is a convenience next to it.
 */
export async function emptyPaidOrderFromCart(order: {
  id: string;
  orderNumber: string;
  userId: string | null;
  visitSid: string | null;
}): Promise<number> {
  try {
    const where = order.userId
      ? { userId: order.userId }
      : order.visitSid
        ? { visitSid: order.visitSid, userId: null }
        : null;
    if (!where) return 0;

    const cart = await db.cart.findFirst({
      where: { ...where, items: { some: {} } },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });
    if (!cart) return 0;

    const ordered = await db.orderItem.findMany({
      where: { orderId: order.id },
      select: { productId: true },
    });
    const productIds = ordered.map((i) => i.productId).filter((id): id is string => !!id);
    if (productIds.length === 0) return 0;

    const removed = await db.cartItem.deleteMany({
      where: { cartId: cart.id, productId: { in: productIds } },
    });
    const left = await db.cartItem.count({ where: { cartId: cart.id } });
    if (left === 0) {
      await db.cart.update({
        where: { id: cart.id },
        data: {
          couponCode: null,
          contactName: null,
          contactPhone: null,
          contactEmail: null,
          contactAt: null,
          followUpStatus: "NEW",
          followUpNote: null,
          followUpAt: null,
          followUpById: null,
        },
      });
    }
    return removed.count;
  } catch (error) {
    console.error("[paid-cart] could not empty the cart", { orderNumber: order.orderNumber, error });
    return 0;
  }
}
