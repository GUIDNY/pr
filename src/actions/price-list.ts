"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canSeePriceList } from "@/lib/price-list-access";
import { submitUrls, productPaths } from "@/lib/indexnow";

/**
 * Changing a sale price from the price sheet.
 *
 * The gate is checked here and not only on the page. A server action is an
 * endpoint: the page decides what to render, this decides what may happen,
 * and the second one is the one that matters.
 *
 * Only `price`. supplierCost is what the supplier charged us — a record of
 * something that already happened, not a number anybody should be able to
 * revise from a table — and the margin on this screen is only true while
 * one side of it stays a fact.
 */
export type PriceUpdateResult = { success: boolean; error: string | null; price?: number };

export async function updateSalePriceAction(productId: string, price: number): Promise<PriceUpdateResult> {
  const session = await getSession();
  if (!session) return { success: false, error: "אין הרשאה" };
  const user = await db.user.findUnique({ where: { id: session.sub }, select: { email: true, role: true } });
  if (!canSeePriceList(user?.email, user?.role)) return { success: false, error: "אין הרשאה" };

  if (!Number.isFinite(price) || price <= 0) return { success: false, error: "מחיר לא תקין" };
  /* A price is agorot, not a long division. Rounding here rather than
     refusing, because the number that produced this is usually a margin
     calculation somebody did in their head. */
  const next = Math.round(price * 100) / 100;

  const before = await db.product.findUnique({
    where: { id: productId },
    select: { slug: true, price: true, supplierCost: true, title: true },
  });
  if (!before) return { success: false, error: "מוצר לא נמצא" };
  if (before.price === next) return { success: true, error: null, price: next };

  await db.product.update({ where: { id: productId }, data: { price: next } });
  /* Both numbers, because "price changed" without them answers nothing six
     weeks later, and the cost is what says whether the new price makes
     sense. */
  await logAudit({
    actorId: session.sub,
    action: "PRODUCT_PRICE_CHANGED",
    entityType: "Product",
    entityId: productId,
    metadata: { from: before.price, to: next, supplierCost: before.supplierCost, title: before.title },
  });

  revalidatePath(`/product/${before.slug}`);
  revalidatePath("/admin/prices");
  /* The price is in the page, in the feed and in the JSON-LD, and Google
     re-reads a product page it has no reason to think changed only when it
     is told. */
  await submitUrls(productPaths([before.slug]));

  return { success: true, error: null, price: next };
}
