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

export type QuickFixField = "price" | "stockQty";

export async function applyUrgentFixAction(
  alertId: string,
  field: QuickFixField,
  rawValue: string,
): Promise<{ success: boolean; error: string | null }> {
  const session = await requireAdmin();

  const alert = await db.inventoryAlert.findUnique({
    where: { id: alertId },
    select: { id: true, isResolved: true, product: { select: { id: true, slug: true, price: true, stockQty: true } } },
  });
  if (!alert?.product) return { success: false, error: "ההתראה לא נמצאה" };
  if (alert.isResolved) return { success: false, error: "ההתראה כבר סומנה כטופלה" };

  const value = Number(rawValue);
  if (!Number.isFinite(value)) return { success: false, error: "ערך לא תקין" };

  let data: { price: number } | { stockQty: number };
  let before: number;

  if (field === "price") {
    if (value <= 0) return { success: false, error: "מחיר חייב להיות גדול מאפס" };
    before = alert.product.price;
    data = { price: value };
  } else {
    if (!Number.isInteger(value) || value < 0) return { success: false, error: "מלאי חייב להיות מספר שלם, אפס ומעלה" };
    before = alert.product.stockQty;
    data = { stockQty: value };
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
    metadata: { via: "urgent-review-quick-fix", alertId, field, before, after: value },
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
