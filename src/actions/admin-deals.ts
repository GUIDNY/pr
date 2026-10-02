"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { submitUrls, productPaths } from "@/lib/indexnow";

/**
 * Putting a product on sale, and taking it off again.
 *
 * "On sale" is not a flag on this site and not a list anybody keeps — the
 * deals rail and /deals are both `compareAtPrice IS NOT NULL`. So a sale is
 * two numbers on the product and nothing else, which is why there was no
 * screen: the only way in was the product form's "מחיר לפני הנחה" field,
 * one product at a time, and nowhere to see what was on sale at all.
 *
 * The pair has to move together or it lies to the customer:
 *
 *   price          what they pay now
 *   compareAtPrice the struck-through number beside it
 *
 * Which is why starting a sale is one action rather than two fields. It
 * copies the current price into compareAtPrice *before* lowering price, so
 * the number shown as "before" is the price this product was actually
 * selling at, not one typed from memory. Get that backwards by hand — lower
 * the price first, then fill in the old one — and the discount on the card
 * is whatever you remembered.
 *
 * Ending a sale is deliberately TWO actions, because they are different
 * decisions that look identical in a table and cannot be undone by guessing:
 *
 *   RESTORE     the sale is over: price goes back up to compareAtPrice.
 *   KEEP_PRICE  the sale price is the new normal price: keep it, just stop
 *               advertising a discount.
 *
 * A single "remove from deals" button has to pick one silently. Picking
 * RESTORE quietly raises a price; picking KEEP_PRICE quietly makes a
 * temporary discount permanent. Neither is safe to assume, so the screen
 * asks.
 *
 * Nothing here touches stock, title or category — a sale is a price
 * decision. And price is a field only a person or the enrichment agent may
 * write (see the ownership table in CLAUDE.md); the sheet sync will not
 * overwrite any of this on its next run.
 */

/** Both prices are money in agorot-free shekels; keep them whole. */
function cleanPrice(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100) / 100;
}

async function touch(productId: string) {
  const product = await db.product.findUnique({ where: { id: productId }, select: { slug: true } });
  if (!product) return;
  revalidatePath("/admin/deals");
  revalidatePath("/deals");
  revalidatePath("/");
  revalidatePath(`/product/${product.slug}`);
  await submitUrls(productPaths([product.slug]));
}

/** Start a sale: today's price becomes the "before", salePrice becomes the price. */
export async function startDealAction(productId: string, salePrice: number) {
  const session = await requireAdmin();
  const price = cleanPrice(salePrice);
  if (price === null) return { success: false, error: "מחיר מבצע לא תקין" };

  const product = await db.product.findUnique({
    where: { id: productId },
    select: { price: true, compareAtPrice: true, title: true },
  });
  if (!product) return { success: false, error: "המוצר לא נמצא" };
  if (product.compareAtPrice !== null) return { success: false, error: "המוצר כבר במבצע" };
  if (price >= product.price) {
    return { success: false, error: `מחיר המבצע חייב להיות נמוך מ-${product.price} ₪` };
  }

  await db.product.update({
    where: { id: productId },
    data: { price, compareAtPrice: product.price },
  });
  await logAudit({
    actorId: session.sub,
    action: "PRODUCT_UPDATED",
    entityType: "Product",
    entityId: productId,
    metadata: { deal: "start", from: product.price, to: price },
  });
  await touch(productId);
  return { success: true, error: null };
}

/** Change the sale price while the sale runs. The "before" price is untouched. */
export async function updateDealPriceAction(productId: string, salePrice: number) {
  const session = await requireAdmin();
  const price = cleanPrice(salePrice);
  if (price === null) return { success: false, error: "מחיר מבצע לא תקין" };

  const product = await db.product.findUnique({
    where: { id: productId },
    select: { price: true, compareAtPrice: true },
  });
  if (!product) return { success: false, error: "המוצר לא נמצא" };
  if (product.compareAtPrice === null) return { success: false, error: "המוצר לא במבצע" };
  if (price >= product.compareAtPrice) {
    return { success: false, error: `מחיר המבצע חייב להיות נמוך מ-${product.compareAtPrice} ₪` };
  }

  await db.product.update({ where: { id: productId }, data: { price } });
  await logAudit({
    actorId: session.sub,
    action: "PRODUCT_UPDATED",
    entityType: "Product",
    entityId: productId,
    metadata: { deal: "reprice", from: product.price, to: price },
  });
  await touch(productId);
  return { success: true, error: null };
}

/**
 * End a sale. RESTORE puts the old price back; KEEP_PRICE makes the sale
 * price the normal one. See the note at the top for why this is not one
 * button.
 */
export async function endDealAction(productId: string, mode: "RESTORE" | "KEEP_PRICE") {
  const session = await requireAdmin();
  const product = await db.product.findUnique({
    where: { id: productId },
    select: { price: true, compareAtPrice: true },
  });
  if (!product) return { success: false, error: "המוצר לא נמצא" };
  if (product.compareAtPrice === null) return { success: false, error: "המוצר לא במבצע" };

  await db.product.update({
    where: { id: productId },
    data:
      mode === "RESTORE"
        ? { price: product.compareAtPrice, compareAtPrice: null }
        : { compareAtPrice: null },
  });
  await logAudit({
    actorId: session.sub,
    action: "PRODUCT_UPDATED",
    entityType: "Product",
    entityId: productId,
    metadata: { deal: "end", mode, price: mode === "RESTORE" ? product.compareAtPrice : product.price },
  });
  await touch(productId);
  return { success: true, error: null };
}
