"use server";

import { db } from "@/lib/db";
import { getOrCreateCart } from "@/lib/cart";
import { buildCartSummary } from "@/lib/cart-summary";

async function currentSummary() {
  const cart = await getOrCreateCart();
  return buildCartSummary(cart);
}

export async function addToCartAction(productId: string, quantity: number = 1) {
  const cart = await getOrCreateCart();
  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product || !product.isPublished) throw new Error("מוצר לא נמצא");
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
