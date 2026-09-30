import "server-only";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { planCartMerge } from "@/lib/cart-merge";

const CART_COOKIE = "prec_cart_sid";
const CART_COOKIE_TTL = 60 * 60 * 24 * 90; // 90 days

const cartInclude = {
  items: {
    include: {
      product: {
        include: {
          brand: true,
          /* The leaf and its department, because whether an order can go to
             a collection point is decided by category — see lib/bulky.ts —
             and the answer has to be the same in the cart, the checkout and
             the order that is written. Loading it here is what makes that
             one lookup rather than three. */
          category: { include: { parent: true } },
          images: { orderBy: { sortOrder: "asc" as const }, take: 1 },
        },
      },
    },
    orderBy: { createdAt: "asc" as const },
  },
};

const EMPTY_CART = { id: "", couponCode: null, items: [] };

/**
 * Read-only cart lookup, safe to call during a Server Component render
 * (cookies() can only be *written* inside a Server Action / Route Handler).
 * Returns an empty, unpersisted cart shape if none exists yet — nothing is
 * created until the user actually adds an item via a Server Action.
 */
export async function getCart() {
  const session = await getSession();
  const cookieStore = await cookies();

  if (session) {
    const existing = await db.cart.findUnique({ where: { userId: session.sub }, include: cartInclude });
    if (existing) return existing;
    return EMPTY_CART;
  }

  const sid = cookieStore.get(CART_COOKIE)?.value;
  if (sid) {
    const existing = await db.cart.findUnique({ where: { sessionId: sid }, include: cartInclude });
    if (existing) return existing;
  }
  return EMPTY_CART;
}

/**
 * Hands the cart this browser filled as a guest to the account that just
 * signed in.
 *
 * WITHOUT THIS, SIGNING IN EMPTIES THE CART. A guest's cart is found by the
 * prec_cart_sid cookie; an account's is found by userId. The moment a session
 * cookie exists, getCart() stops looking at the sid and asks for the account's
 * cart, which on a first sign-in does not exist — so the checkout page renders
 * "אין פריטים בעגלה" over a cart that is still sitting in the database under
 * the old key. Nothing was deleted and nothing can be recovered by the
 * customer, which is the worst shape a bug like this comes in: they had five
 * items, they did what the site asked, and the site answered with an empty
 * page and a "back to the shop" button.
 *
 * The adoption used to live in getOrCreateCart(), which only runs on a WRITE —
 * adding an item, changing a quantity. So the cart came back if the customer
 * added something else afterwards, and stayed gone if they did what a person
 * actually does at that point, which is leave. Sign-in is the moment the two
 * identities become one, so that is where this belongs, and every path that
 * creates a session calls it: the password form, registration, a password
 * reset, and Google and Apple on both the web and the app.
 *
 * Two cases, and the second is the one the old code dropped on the floor:
 *
 *   - the account has no cart → the guest cart becomes theirs, keys swapped,
 *     nothing copied and nothing to go wrong.
 *   - the account already has one, from another device or an earlier visit →
 *     the two are merged rather than one of them winning. Discarding the guest
 *     cart loses what they just chose; discarding the account's loses what
 *     they chose last week. Quantities for the same product add up and are
 *     capped exactly as addToCartAction caps them, so a merge cannot produce a
 *     line the shop would refuse to sell.
 *
 * It never throws. A cart that failed to merge is a bad afternoon; a sign-in
 * that 500s because of a cart is a customer who cannot get in at all.
 */
export async function claimGuestCart(userId: string) {
  try {
    const cookieStore = await cookies();
    const sid = cookieStore.get(CART_COOKIE)?.value;
    if (!sid) return;

    const guestCart = await db.cart.findUnique({ where: { sessionId: sid }, include: { items: true } });
    /* The cookie outlives the cart by 90 days, so a stale sid is ordinary
       rather than exceptional. Clear it either way: leaving it behind means
       every later sign-out lands this browser back on a cart that is now
       somebody's account. */
    if (!guestCart) {
      cookieStore.delete(CART_COOKIE);
      return;
    }

    const userCart = await db.cart.findUnique({ where: { userId }, include: { items: true } });

    if (!userCart) {
      await db.cart.update({ where: { id: guestCart.id }, data: { userId, sessionId: null } });
      cookieStore.delete(CART_COOKIE);
      return;
    }

    /* Stock is read here rather than trusted from the cart row, because the
       guest cart may have been filled days ago and the cap has to be the one
       in force now — the same cap addToCartAction applies, so that a cart
       arrived at by merging is indistinguishable from one arrived at by
       pressing "add" twice. */
    const products = await db.product.findMany({
      where: { id: { in: guestCart.items.map((i) => i.productId) } },
      select: { id: true, stockQty: true },
    });
    const stock = new Map(products.map((p) => [p.id, p.stockQty]));
    const plan = planCartMerge(guestCart.items, userCart.items, stock);

    const writes: Prisma.PrismaPromise<unknown>[] = [];
    for (const u of plan.updates) {
      writes.push(db.cartItem.update({ where: { id: u.itemId }, data: { quantity: u.quantity } }));
    }
    for (const c of plan.creates) {
      writes.push(db.cartItem.create({ data: { cartId: userCart.id, ...c } }));
    }

    /* A coupon the guest typed carries over only into a cart that has none.
       Replacing one they already had would silently change what they are
       about to pay, and the guest's code may not even apply to the merged
       basket — the checkout re-validates it either way. */
    if (guestCart.couponCode && !userCart.couponCode) {
      writes.push(db.cart.update({ where: { id: userCart.id }, data: { couponCode: guestCart.couponCode } }));
    }

    /* The contact details typed into a checkout that was walked away from are
       what /admin/abandoned rings about. They live on the cart row, so a merge
       that deletes the guest row deletes the lead with it unless it is carried
       across — and only when the surviving row has none, for the same reason
       as the coupon. */
    if (guestCart.contactAt && !userCart.contactAt) {
      writes.push(
        db.cart.update({
          where: { id: userCart.id },
          data: {
            contactName: guestCart.contactName,
            contactPhone: guestCart.contactPhone,
            contactEmail: guestCart.contactEmail,
            contactAt: guestCart.contactAt,
          },
        }),
      );
    }

    writes.push(db.cart.delete({ where: { id: guestCart.id } }));
    await db.$transaction(writes);
    cookieStore.delete(CART_COOKIE);
  } catch (error) {
    console.error("claimGuestCart failed", error);
  }
}

/**
 * Finds-or-creates the current cart and, for guests, sets the session
 * cookie. Only callable from a Server Action / Route Handler.
 */
export async function getOrCreateCart() {
  const session = await getSession();

  if (session) {
    /* Sign-in already did this, and it is repeated here because a cart that
       silently empties is worth two database round trips: a session can also
       begin on a path that never reached the sign-in code — an app that
       restored a cookie, a session refreshed by middleware. It is a no-op
       whenever there is no guest cookie, which is almost always. */
    await claimGuestCart(session.sub);

    const existing = await db.cart.findUnique({ where: { userId: session.sub }, include: cartInclude });
    if (existing) return existing;

    return db.cart.create({ data: { userId: session.sub }, include: cartInclude });
  }

  const cookieStore = await cookies();
  let sid = cookieStore.get(CART_COOKIE)?.value;

  if (sid) {
    const existing = await db.cart.findUnique({ where: { sessionId: sid }, include: cartInclude });
    if (existing) return existing;
  }

  sid = randomUUID();
  cookieStore.set(CART_COOKIE, sid, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CART_COOKIE_TTL,
  });

  return db.cart.create({ data: { sessionId: sid }, include: cartInclude });
}

/**
 * Puts `quantity` of a product into a cart, or adds it to the line already
 * there, capped at what is in stock and at 10 a line. The cap is the shop's
 * rule for every way into a cart (the add button, the 3D mall's buy-now
 * link), so it lives here once rather than being copied into each of them.
 *
 * Whether the product may be sold at all is the caller's question, answered
 * with PUBLIC_PRODUCT_WHERE before this is reached.
 */
export async function addLineToCart(
  cart: { id: string; items: { id: string; productId: string; quantity: number }[] },
  product: { id: string; stockQty: number },
  quantity: number,
) {
  const existing = cart.items.find((i) => i.productId === product.id);
  const maxQty = Math.max(1, Math.min(product.stockQty, 10));

  if (existing) {
    const nextQty = Math.min(existing.quantity + quantity, maxQty);
    await db.cartItem.update({ where: { id: existing.id }, data: { quantity: nextQty } });
  } else {
    await db.cartItem.create({ data: { cartId: cart.id, productId: product.id, quantity: Math.min(quantity, maxQty) } });
  }
}

/**
 * Makes sure a cart holds at least `quantity` of a product, never adding on
 * top. "קנה עכשיו" in the 3D mall means "this, in my checkout": pressing it
 * twice, or sending the game's basket again after the customer removed a line
 * on the site and put it back in the game, must not turn one into two. A line
 * already at or above `quantity` is left exactly as the customer set it. Same
 * cap as addLineToCart.
 */
export async function ensureCartLine(
  cart: { id: string; items: { id: string; productId: string; quantity: number }[] },
  product: { id: string; stockQty: number },
  quantity: number,
) {
  const existing = cart.items.find((i) => i.productId === product.id);
  const wanted = Math.min(quantity, Math.max(1, Math.min(product.stockQty, 10)));
  if (!existing) {
    await db.cartItem.create({ data: { cartId: cart.id, productId: product.id, quantity: wanted } });
  } else if (existing.quantity < wanted) {
    await db.cartItem.update({ where: { id: existing.id }, data: { quantity: wanted } });
  }
}

export async function getCartItemCount() {
  const cart = await getCart();
  return cart.items.reduce((sum, i) => sum + i.quantity, 0);
}
