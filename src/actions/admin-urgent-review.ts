"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { submitUrls, productPaths } from "@/lib/indexnow";

/**
 * The one-field fixes for the urgent queue.
 *
 * Most of that list is a decision, not a repair: a finding says which of two
 * prices is real, or that a stock count of 999 is the sheet's placeholder
 * rather than a shelf. Once someone has read it, the work is a single number.
 * Sending them to the full product form for that is what made a 60-item queue
 * feel like 60 jobs.
 *
 * Deliberately narrow. Each call writes exactly one column on one product —
 * never a form's worth of fields, and never `enrichmentStatus`, which is what
 * the full form sets to stop the sync rewriting titles and categories. A
 * price correction is not a statement about a product's content.
 *
 * Four fields, because four kinds of finding end in one of them: a price, a
 * stock count, the wrong manufacturer, or a model code. The sync does not
 * rewrite brand or model on an existing product (see stockOnlyUpdate in
 * lib/inventory/sync.ts), so those two corrections are permanent — unlike the
 * stock one, which the next sync reads back from the sheet.
 */

function resolveOnlyThisAlert(alertId: string) {
  // By id, not by type: 9 products hold MANUAL_ATTENTION open alongside
  // MANUAL_URGENT for a different reason, and clearing the urgent finding
  // must not quietly clear the other one too.
  return db.inventoryAlert.updateMany({
    where: { id: alertId, isResolved: false },
    data: { isResolved: true, resolvedAt: new Date() },
  });
}

function revalidateQueues(slug: string) {
  revalidatePath("/admin/inventory/urgent-critical");
  revalidatePath("/admin/inventory/urgent");
  revalidatePath("/admin/inventory");
  revalidatePath(`/product/${slug}`);
}

export type QuickFixField = "price" | "stockQty" | "brandId" | "model";

export async function applyUrgentFixAction(
  alertId: string,
  field: QuickFixField,
  rawValue: string,
): Promise<{ success: boolean; error: string | null }> {
  const session = await requireAdmin();

  const alert = await db.inventoryAlert.findUnique({
    where: { id: alertId },
    select: {
      id: true,
      isResolved: true,
      product: { select: { id: true, slug: true, price: true, stockQty: true, brandId: true, model: true } },
    },
  });
  if (!alert?.product) return { success: false, error: "ההתראה לא נמצאה" };
  if (alert.isResolved) return { success: false, error: "ההתראה כבר סומנה כטופלה" };

  let data: { price: number } | { stockQty: number } | { brandId: string } | { model: string };
  let before: string | number;

  if (field === "price" || field === "stockQty") {
    const value = Number(rawValue);
    if (!Number.isFinite(value)) return { success: false, error: "ערך לא תקין" };
    if (field === "price") {
      if (value <= 0) return { success: false, error: "מחיר חייב להיות גדול מאפס" };
      before = alert.product.price;
      data = { price: value };
    } else {
      if (!Number.isInteger(value) || value < 0) {
        return { success: false, error: "מלאי חייב להיות מספר שלם, אפס ומעלה" };
      }
      before = alert.product.stockQty;
      data = { stockQty: value };
    }
  } else if (field === "brandId") {
    // Chosen from the real list, never typed: a free-text brand is how a
    // catalogue ends up with "Bosch", "bosch" and "בוש" as three brands.
    const brand = await db.brand.findUnique({ where: { id: rawValue }, select: { id: true } });
    if (!brand) return { success: false, error: "המותג לא נמצא" };
    if (brand.id === alert.product.brandId) return { success: false, error: "זה כבר המותג של המוצר" };
    before = alert.product.brandId;
    data = { brandId: brand.id };
  } else {
    const model = rawValue.trim();
    if (!model) return { success: false, error: "קוד דגם לא יכול להיות ריק" };
    if (model.length > 120) return { success: false, error: "קוד דגם ארוך מדי" };
    before = alert.product.model ?? "";
    data = { model };
  }

  await db.$transaction(async (tx) => {
    await tx.product.update({ where: { id: alert.product!.id }, data });
    await tx.inventoryAlert.updateMany({
      where: { id: alertId, isResolved: false },
      data: { isResolved: true, resolvedAt: new Date() },
    });
  });

  await logAudit({
    actorId: session.sub,
    action: "PRODUCT_UPDATED",
    entityType: "Product",
    entityId: alert.product.id,
    metadata: { via: "urgent-review-quick-fix", alertId, field, before, after: Object.values(data)[0] },
  });

  revalidateQueues(alert.product.slug);
  // A price change is a change to what the feed says, so Bing hears about it
  // now rather than on the next crawl. A stock change moves the product in or
  // out of the feed entirely, which is the same story.
  await submitUrls(productPaths([alert.product.slug]));

  return { success: true, error: null };
}

/**
 * "Read it, nothing to change." Clears this one finding and leaves the
 * product exactly as it is — the honest outcome for a finding that turns out
 * to describe something already correct.
 */
export async function resolveUrgentAlertAction(
  alertId: string,
): Promise<{ success: boolean; error: string | null }> {
  const session = await requireAdmin();

  const alert = await db.inventoryAlert.findUnique({
    where: { id: alertId },
    select: { id: true, product: { select: { id: true, slug: true } } },
  });
  if (!alert) return { success: false, error: "ההתראה לא נמצאה" };

  await resolveOnlyThisAlert(alertId);
  await logAudit({
    actorId: session.sub,
    action: "PRODUCT_REVIEW_FLAG_SET",
    entityType: "Product",
    entityId: alert.product?.id ?? alertId,
    metadata: { via: "urgent-review-resolve", alertId, level: "NONE" },
  });

  if (alert.product) revalidateQueues(alert.product.slug);
  return { success: true, error: null };
}
