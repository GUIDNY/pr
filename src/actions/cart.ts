"use server";

import { db } from "@/lib/db";
import { PUBLIC_PRODUCT_WHERE } from "@/lib/queries/products";
import { getCart, getOrCreateCart } from "@/lib/cart";
import { buildCartSummary } from "@/lib/cart-summary";

async function currentSummary() {
  const cart = await getOrCreateCart();
  return buildCartSummary(cart);
}

export async function addToCartAction(productId: string, quantity: number = 1) {
  const cart = await getOrCreateCart();
  // Same gate the listings use (PUBLIC_PRODUCT_WHERE): a product with no
  // photograph is not on the site, so it cannot be added to a cart either —
  // otherwise a stale product page left open in a tab is a way around it.
  const product = await db.product.findFirst({
    where: { id: productId, ...PUBLIC_PRODUCT_WHERE },
  });
  if (!product) throw new Error("מוצר לא נמצא");
  if (product.stockStatus === "OUT_OF_STOCK") throw new Error("המוצר אזל מהמלאי");

  const existing = cart.items.find((i) => i.productId === productId);
  const maxQty = Math.max(1, Math.min(product.stockQty, 10));
  const nextQty = Math.min((existing?.quantity ?? 0) + quantity, maxQty);

  if (existing) {
    await db.cartItem.update({ where: { id: existing.id }, data: { quantity: nextQty } });
  } else {
    await db.cartItem.create({ data: { cartId: cart.id, productId, quantity: Math.min(quantity, maxQty) } });
  }

  return currentSummary();
}

export async function updateCartItemAction(itemId: string, quantity: number) {
  const cart = await getOrCreateCart();
  const item = cart.items.find((i) => i.id === itemId);
  if (!item) throw new Error("פריט לא נמצא בעגלה");

  if (quantity <= 0) {
    await db.cartItem.delete({ where: { id: itemId } });
  } else {
    const maxQty = Math.max(1, Math.min(item.product.stockQty, 10));
    await db.cartItem.update({ where: { id: itemId }, data: { quantity: Math.min(quantity, maxQty) } });
  }

  return currentSummary();
}

export async function removeCartItemAction(itemId: string) {
  const cart = await getOrCreateCart();
  const item = cart.items.find((i) => i.id === itemId);
  if (item) await db.cartItem.delete({ where: { id: itemId } });
  return currentSummary();
}

export async function applyCouponAction(code: string) {
  const cart = await getOrCreateCart();
  await db.cart.update({ where: { id: cart.id }, data: { couponCode: code.trim().toUpperCase() } });
  return currentSummary();
}

export async function removeCouponAction() {
  const cart = await getOrCreateCart();
  await db.cart.update({ where: { id: cart.id }, data: { couponCode: null } });
  return currentSummary();
}

export async function getCartSummaryAction() {
  return currentSummary();
}

/**
 * Keeps the contact details a customer typed into the checkout form, so an
 * order they walked away from halfway is something the shop can ring about
 * rather than a lost sale nobody ever hears of. Called as each field is left,
 * never on submit — by the time the order exists this has nothing to add.
 *
 * Deliberately narrow:
 * - It saves nothing until the phone is long enough to actually call. A
 *   half-typed number is not a lead, it is a row someone has to sift through.
 * - It never touches the follow-up status. Someone editing their phone number
 *   is not a new lead, and re-opening a call the shop already made would have
 *   customers rung twice.
 * - It never throws. This runs beside a checkout: a failure here must cost a
 *   callback, never an order.
 *
 * The checkout form tells the customer this is kept (and the privacy policy
 * spells it out) — that notice is the condition on which this is lawful, so
 * the two move together.
 */
export async function saveCheckoutContactAction(input: {
  fullName?: string;
  phone?: string;
  email?: string;
}) {
  try {
    const phone = input.phone?.trim() ?? "";
    if (phone.replace(/\D/g, "").length < 9) return { success: false as const };

    const cart = await getCart();
    if (!cart.id || cart.items.length === 0) return { success: false as const };

    await db.cart.update({
      where: { id: cart.id },
      data: {
        contactName: input.fullName?.trim().slice(0, 120) || null,
        contactPhone: phone.slice(0, 30),
        contactEmail: input.email?.trim().slice(0, 160) || null,
        contactAt: new Date(),
      },
    });
    return { success: true as const };
  } catch {
    return { success: false as const };
  }
}
