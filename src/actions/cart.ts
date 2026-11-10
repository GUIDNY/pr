"use server";

import { db } from "@/lib/db";
import { PUBLIC_PRODUCT_WHERE } from "@/lib/queries/products";
import { addLineToCart, getCart, getOrCreateCart } from "@/lib/cart";
import { buildCartSummary } from "@/lib/cart-summary";
import { maxCartQuantity } from "@/lib/cart-merge";

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
    include: { source: { select: { key: true } } },
  });
  if (!product) throw new Error("מוצר לא נמצא");
  if (product.stockStatus === "OUT_OF_STOCK") throw new Error("המוצר אזל מהמלאי");

  await addLineToCart(cart, { ...product, sourceKey: product.source?.key ?? null }, quantity);

  return currentSummary();
}

export async function updateCartItemAction(itemId: string, quantity: number) {
  const cart = await getOrCreateCart();
  const item = cart.items.find((i) => i.id === itemId);
  if (!item) throw new Error("פריט לא נמצא בעגלה");

  if (quantity <= 0) {
    await db.cartItem.delete({ where: { id: itemId } });
  } else {
    const maxQty = maxCartQuantity(
      item.product.stockQty,
      item.product.sourceAvailability,
      item.product.source?.key ?? null,
    );
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
 * rather than a lost sale nobody ever hears of. Called as a field is left and
 * 800 ms after typing stops — never only on submit, because by then the order
 * exists and this has nothing to add.
 *
 * - Whatever was typed is kept, partial or not. It used to wait for a
 *   nine-digit phone, and three checkouts in four were walked away from
 *   before that: in November 6 carts had details against 22 without. A name
 *   and seven digits are a lead; nothing is not. Validation stays where it
 *   was, on placing the order — nothing here ever shows the customer an
 *   error.
 * - A field that arrives empty never clears one already kept. Clearing the
 *   phone box to retype it must not lose the number.
 * - It never touches the follow-up status. Someone editing their phone
 *   number is not a new lead, and re-opening a call the shop already made
 *   would have customers rung twice. A new cart starts at NEW by default.
 * - It never throws. This runs beside a checkout: a failure here must cost a
 *   callback, never an order.
 *
 * What it permits is a call about the purchase the customer started. It is
 * not consent to advertise — see the checkout's marketing notice. The
 * checkout form tells the customer this is kept (and the privacy policy
 * spells it out); that notice is the condition on which this is lawful, so
 * the two move together.
 */
export async function saveCheckoutContactAction(input: {
  fullName?: string;
  phone?: string;
  email?: string;
}) {
  try {
    const name = input.fullName?.trim().slice(0, 120) || undefined;
    const phone = input.phone?.trim().slice(0, 30) || undefined;
    const email = input.email?.trim().slice(0, 160) || undefined;
    if (!name && !phone && !email) return { success: false as const };

    const cart = await getCart();
    if (!cart.id || cart.items.length === 0) return { success: false as const };

    await db.cart.update({
      where: { id: cart.id },
      data: {
        ...(name ? { contactName: name } : {}),
        ...(phone ? { contactPhone: phone } : {}),
        ...(email ? { contactEmail: email } : {}),
        contactAt: new Date(),
      },
    });
    return { success: true as const };
  } catch {
    return { success: false as const };
  }
}
