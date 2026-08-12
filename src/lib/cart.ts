import "server-only";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

const CART_COOKIE = "prec_cart_sid";
const CART_COOKIE_TTL = 60 * 60 * 24 * 90; // 90 days

const cartInclude = {
  items: {
    include: {
      product: {
        include: { brand: true, images: { orderBy: { sortOrder: "asc" as const }, take: 1 } },
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
 * Finds-or-creates the current cart and, for guests, sets the session
 * cookie. Only callable from a Server Action / Route Handler.
 */
export async function getOrCreateCart() {
  const session = await getSession();

  if (session) {
    const existing = await db.cart.findUnique({ where: { userId: session.sub }, include: cartInclude });
    if (existing) return existing;

    // merge in a guest cart if one exists on this browser
    const cookieStore = await cookies();
    const guestSid = cookieStore.get(CART_COOKIE)?.value;
    const guestCart = guestSid
      ? await db.cart.findUnique({ where: { sessionId: guestSid }, include: cartInclude })
      : null;

    if (guestCart) {
      const merged = await db.cart.update({
        where: { id: guestCart.id },
        data: { userId: session.sub, sessionId: null },
        include: cartInclude,
      });
      return merged;
    }

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

export async function getCartItemCount() {
  const cart = await getCart();
  return cart.items.reduce((sum, i) => sum + i.quantity, 0);
}
