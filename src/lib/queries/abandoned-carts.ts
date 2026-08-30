import "server-only";
import { db } from "@/lib/db";
import type { CartFollowUpStatus } from "@/lib/enums";

/* A checkout someone started and walked away from. There is no separate table
   behind this: the cart rows already hold the items, and createOrderAction
   empties a cart the moment its order exists — so "has items AND has contact
   details" is, by construction, "was abandoned mid-checkout". Nothing has to
   be swept or expired. */

// Someone still filling in the delivery address is not abandoned, they are
// mid-purchase, and calling them while they type would be worse than not
// calling at all.
const SETTLE_MINUTES = 30;

// Below this the call costs more than the cart is worth, and a list padded
// with accidental ₪40 starts is a list nobody opens.
export const DEFAULT_MIN_VALUE = 300;

export type AbandonedCart = Awaited<ReturnType<typeof getAbandonedCarts>>["carts"][number];

export async function getAbandonedCarts({
  status = "NEW",
  minValue = DEFAULT_MIN_VALUE,
  take = 200,
}: {
  status?: CartFollowUpStatus | "ALL";
  minValue?: number;
  take?: number;
} = {}) {
  const rows = await db.cart.findMany({
    where: {
      contactAt: { not: null, lt: new Date(Date.now() - SETTLE_MINUTES * 60 * 1000) },
      items: { some: {} },
      ...(status === "ALL" ? {} : { followUpStatus: status }),
    },
    include: {
      user: { select: { name: true, email: true } },
      followUpBy: { select: { name: true } },
      items: {
        include: {
          product: {
            select: {
              title: true,
              slug: true,
              price: true,
              images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
            },
          },
        },
      },
    },
    orderBy: { contactAt: "desc" },
    take,
  });

  // The list price of what is in the cart, not a quote: coupons and automatic
  // promotions are settled at checkout, and this number exists to rank calls
  // by size, not to be read back to the customer.
  const carts = rows
    .map((cart) => ({
      ...cart,
      value: cart.items.reduce((sum, item) => sum + item.product.price * item.quantity, 0),
    }))
    .filter((cart) => cart.value >= minValue)
    .sort((a, b) => b.value - a.value);

  return { carts, totalValue: carts.reduce((sum, cart) => sum + cart.value, 0) };
}

/** The dashboard tile: how much is sitting in untouched abandoned carts. */
export async function getAbandonedCartsSummary() {
  const { carts, totalValue } = await getAbandonedCarts({ status: "NEW" });
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  return {
    count: carts.length,
    totalValue,
    todayCount: carts.filter((cart) => (cart.contactAt?.getTime() ?? 0) >= dayAgo).length,
  };
}
