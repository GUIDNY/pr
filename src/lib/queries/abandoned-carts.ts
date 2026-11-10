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

/**
 * The carts nobody can be called about: items worth more than the floor and
 * no phone. Three in four abandoned carts look like this, and until now the
 * back office showed none of them — so what was being walked away from, how
 * much, and from which channel was invisible. Nothing here is actionable
 * per person; it is a picture of where money leaks.
 *
 * Sorted by the last time the cart was touched. `pages` is the visit's path
 * through the site (PageView by visitSid), for reading what the person looked
 * at before leaving — the visit id is a session, not a person (lib/pageview).
 */
export async function getAnonymousCarts({
  minValue = DEFAULT_MIN_VALUE,
  take = 200,
}: { minValue?: number; take?: number } = {}) {
  const rows = await db.cart.findMany({
    where: {
      contactPhone: null,
      updatedAt: { lt: new Date(Date.now() - SETTLE_MINUTES * 60 * 1000) },
      items: { some: {} },
    },
    select: {
      id: true,
      createdAt: true,
      updatedAt: true,
      visitSid: true,
      gclid: true,
      attribution: true,
      userId: true,
      items: {
        select: {
          id: true,
          quantity: true,
          product: { select: { title: true, slug: true, price: true } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: take * 3,
  });

  const carts = rows
    .map((cart) => ({
      ...cart,
      value: cart.items.reduce((sum, item) => sum + item.product.price * item.quantity, 0),
    }))
    .filter((cart) => cart.value >= minValue)
    .slice(0, take);

  const sids = [...new Set(carts.map((c) => c.visitSid).filter((s): s is string => !!s))];
  const views = sids.length
    ? await db.pageView.findMany({
        where: { sid: { in: sids }, isBot: false, isRsc: false },
        select: { sid: true, path: true },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const pagesBySid = new Map<string, string[]>();
  for (const v of views) {
    const list = pagesBySid.get(v.sid) ?? [];
    if (list[list.length - 1] !== v.path) list.push(v.path);
    pagesBySid.set(v.sid, list);
  }

  return {
    carts: carts.map((c) => ({ ...c, pages: c.visitSid ? pagesBySid.get(c.visitSid) ?? [] : [] })),
    totalValue: carts.reduce((sum, cart) => sum + cart.value, 0),
  };
}
