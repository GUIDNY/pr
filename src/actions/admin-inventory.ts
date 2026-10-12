"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { runFullSync } from "@/lib/inventory/sync";
import { ingestSourceFile } from "@/lib/inventory/ingest-source";
import { extractSpreadsheetId, extractGid, fetchSheetWorkbook } from "@/lib/inventory/google-sheets-source";

export async function runManualSyncAction() {
  const session = await requireAdmin();
  const run = await runFullSync("MANUAL", session.sub);
  await logAudit({ actorId: session.sub, action: "INVENTORY_SYNC_TRIGGERED", entityType: "InventorySyncRun", entityId: run.id });
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/inventory/history");
  revalidatePath("/admin");
  return {
    success: run.status !== "FAILED",
    status: run.status,
    error: run.errorMessage,
    productsAdded: run.productsAdded,
    productsUpdated: run.productsUpdated,
    productsMissing: run.productsMissing,
    priceChanges: run.priceChanges,
    pricesAdopted: run.pricesAdopted,
    stockChanges: run.stockChanges,
  };
}

export async function getInventoryDrawerDataAction(id: string) {
  await requireAdmin();
  const { getInventoryProductDetail } = await import("@/lib/queries/admin-inventory");
  return getInventoryProductDetail(id);
}

export async function resyncSingleProductAction(id: string) {
  const session = await requireAdmin();
  const product = await db.product.findUnique({ where: { id }, select: { sourceId: true, title: true } });
  if (!product?.sourceId) return { success: false, error: "למוצר זה אין מקור מחובר לסנכרון" };
  // A single product can't be re-fetched in isolation — the source file is
  // the unit of sync. Force the next sync to actually re-scan by clearing
  // the stored hash, then run it now.
  await db.inventorySource.update({ where: { id: product.sourceId }, data: { fileHash: null } });
  const run = await runFullSync("MANUAL", session.sub);
  revalidatePath("/admin/inventory");
  revalidatePath(`/admin/inventory/${id}`);
  return { success: run.status !== "FAILED", status: run.status };
}

export async function uploadInventorySourceAction(formData: FormData) {
  const session = await requireAdmin();
  const file = formData.get("file") as File | null;
  const key = formData.get("key") as string | null;
  if (!file || !key) return { success: false, error: "חסר קובץ או מקור" };

  /* The same path the agent's endpoint takes — see lib/inventory/ingest-source.
     The delicate half of this (stamping row keys off the outgoing file before
     the incoming one shifts every row) used to live here, which meant a second
     caller had to remember to do it. Now there is nothing to remember. */
  try {
    await ingestSourceFile({
      key,
      filename: file.name,
      bytes: Buffer.from(await file.arrayBuffer()),
      actorId: session.sub,
    });
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "העלאה נכשלה" };
  }

  await logAudit({ actorId: session.sub, action: "INVENTORY_SOURCE_UPLOADED", entityType: "InventorySource", entityId: key });
  revalidatePath("/admin/inventory/sources");
  return { success: true, error: null };
}

export async function addGoogleSheetSourceAction(formData: FormData) {
  const session = await requireAdmin();
  const url = (formData.get("sheetUrl") as string | null)?.trim();
  const name = (formData.get("name") as string | null)?.trim();
  const categorySlug = (formData.get("categorySlug") as string | null)?.trim() || null;
  if (!url || !name) return { success: false, error: "חסר קישור לגליון או שם" };

  const spreadsheetId = extractSpreadsheetId(url);
  if (!spreadsheetId) return { success: false, error: "קישור הגליון אינו תקין" };
  const gid = extractGid(url);

  // The whole spreadsheet is fetched (every tab), not just one gid — a
  // multi-tab Google Sheet gets parsed exactly like an Excel workbook, one
  // category per tab. gid is stored for reference only.
  let workbookSize: number;
  try {
    const bytes = await fetchSheetWorkbook(spreadsheetId);
    workbookSize = bytes.length;
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "נכשל בטעינת הגליון" };
  }

  const key = `gsheet-${spreadsheetId}`;

  // fileHash left unset here for the same reason as the Excel upload above
  // — runFullSync needs to see it as "changed" on the next sync.
  await db.inventorySource.upsert({
    where: { key },
    update: {
      filename: name,
      sheetUrl: url,
      sheetGid: gid,
      categorySlugOverride: categorySlug,
      fileSizeBytes: workbookSize,
      isActive: true,
      uploadedById: session.sub,
      uploadedAt: new Date(),
    },
    create: {
      key,
      sourceType: "GOOGLE_SHEET",
      filename: name,
      sheetUrl: url,
      sheetGid: gid,
      categorySlugOverride: categorySlug,
      fileSizeBytes: workbookSize,
      isActive: true,
      uploadedById: session.sub,
    },
  });

  await logAudit({ actorId: session.sub, action: "INVENTORY_SOURCE_ADDED", entityType: "InventorySource", entityId: key });
  revalidatePath("/admin/inventory/sources");
  return { success: true, error: null };
}

/**
 * Turning a source off also takes its products off the site.
 *
 * runFullSync reads active sources only, and "gone from the price list" is
 * measured against the sources it actually scanned — so a deactivated
 * source's products are never seen, never missed, and stay live for ever on
 * whatever the sheet last said. Three Google Sheet sources were switched off
 * on 19 August; on 11 October four of their products were still being sold,
 * priced from August: a Polk V60 Slim at 1,290, a DeLonghi Magnifica at
 * 1,790, an Electrolux EW6T4723AM at 2,290 and a Normande ND80120 at 1,390.
 * Seven weeks of stock and prices nothing was checking.
 *
 * missingFromSourceSince rather than isPublished, for the same reason the
 * sitemap keeps the page: this is the field that already means "no row in
 * any price list backs this", every public query reads it, and
 * stockOnlyUpdate clears it the moment a row matches the product again. So
 * switching the source back on returns its products by itself, with all the
 * content work intact.
 */
export async function toggleSourceActiveAction(id: string, isActive: boolean) {
  const session = await requireAdmin();
  await db.inventorySource.update({ where: { id }, data: { isActive } });
  /* Only on the way off. Coming back on is the sync's job: the next run
     reads the source and clears the flag per product it matches, which is
     a per-product answer this action cannot give. */
  const removed = isActive
    ? { count: 0 }
    : await db.product.updateMany({
        where: { sourceId: id, missingFromSourceSince: null },
        data: { missingFromSourceSince: new Date() },
      });
  await logAudit({
    actorId: session.sub,
    action: isActive ? "INVENTORY_SOURCE_ACTIVATED" : "INVENTORY_SOURCE_DEACTIVATED",
    entityType: "InventorySource",
    entityId: id,
    metadata: { productsTakenOffTheSite: removed.count },
  });
  // Toggling a source's active state can resolve or create a cross-source
  // SKU conflict without any file ever changing — no sync run would
  // otherwise re-evaluate that.
  const { reconcileSourceConflictAlerts } = await import("@/lib/inventory/sync");
  await reconcileSourceConflictAlerts(null);
  revalidatePath("/admin/inventory/sources");
  revalidatePath("/admin/inventory");
  return { success: true, error: null };
}

export async function resolveAlertAction(id: string) {
  const session = await requireAdmin();
  await db.inventoryAlert.update({
    where: { id },
    data: { isResolved: true, resolvedAt: new Date(), resolvedById: session.sub },
  });
  revalidatePath("/admin/inventory/alerts");
  revalidatePath("/admin/inventory");
  return { success: true, error: null };
}

export async function toggleProductPublishAction(id: string, isPublished: boolean) {
  const session = await requireAdmin();
  await db.product.update({ where: { id }, data: { isPublished } });
  await logAudit({
    actorId: session.sub,
    action: isPublished ? "PRODUCT_PUBLISHED" : "PRODUCT_UNPUBLISHED",
    entityType: "Product",
    entityId: id,
  });
  revalidatePath("/admin/inventory");
  revalidatePath(`/admin/inventory/${id}`);
  return { success: true, error: null };
}

/**
 * Publish a product that only its own quarantine flag is holding back.
 *
 * The flags — MODEL_CONFLICT_DO_NOT_PUBLISH and its relatives, and
 * NEEDS_REVIEW — were a dead end in the back office: a person could see
 * that something had been decided about a product and not what, and had no
 * way to overrule it from the page that listed it. This is that way, and
 * it is deliberately not toggleProductPublishAction: that one flips
 * isPublished and leaves the flag saying "do not publish" on a published
 * product, which is how a Haier fridge ended up live, marked as a
 * duplicate, with the sheet's raw model code for a title.
 *
 * It re-reads the product and checks every public gate itself rather than
 * trusting the page that offered the button — a page is a snapshot, and
 * "published" on a product with no photograph or no price is a lie that
 * reports the job as done.
 */
export async function approveAndPublishAction(id: string) {
  const session = await requireAdmin();
  const p = await db.product.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      title: true,
      price: true,
      supplierCost: true,
      stockQty: true,
      stockStatus: true,
      enrichmentStatus: true,
      missingFromSourceSince: true,
      _count: { select: { images: true } },
    },
  });
  if (!p) return { success: false, error: "המוצר לא נמצא" };
  if (p.missingFromSourceSince !== null) return { success: false, error: "המחירון לא נושא את המוצר יותר — אין מה לפרסם" };
  if (p.stockQty <= 0) return { success: false, error: "אין מלאי" };
  if (p.price <= 0) return { success: false, error: "אין מחיר מכירה — להזין מחיר קודם" };
  if (p._count.images === 0) return { success: false, error: "אין תמונה — מוצר בלי תמונה לא מוצג באתר גם כשהוא מפורסם" };
  if (p.stockStatus === "NEEDS_REVIEW") return { success: false, error: "נתוני המלאי לא עקביים — לבדוק את הכמות קודם" };
  /* The owner's rule, stated flatly: a price can never be under the cost.
     Publishing is the one moment it would start costing money. */
  if (p.supplierCost !== null && p.supplierCost > 0 && p.price < p.supplierCost) {
    return { success: false, error: `המחיר (${p.price} ₪) מתחת לעלות (${p.supplierCost} ₪)` };
  }
  /* And a price fault nobody has answered yet. "Below cost" does not catch
     a placeholder: the Sauter mincer attachment carries a price of 1 ₪
     against a cost of 1 ₪, which passes the comparison above and is
     obviously not a price. These two alert types are the ones this action
     deliberately leaves open — publishing says nothing about a money
     problem — so publishing straight over one is the contradiction. */
  const priceFault = await db.inventoryAlert.findFirst({
    where: { productId: id, isResolved: false, type: { in: ["INVALID_PRICE", "PRICE_BELOW_COST"] } },
    select: { message: true },
  });
  if (priceFault) {
    return { success: false, error: `יש תקלת מחיר פתוחה על המוצר: ${priceFault.message.slice(0, 120)}` };
  }

  await db.product.update({
    where: { id },
    data: { isPublished: true, enrichmentStatus: "ENRICHED" },
  });
  /* The objections a person has just overruled. Not the money and stock
     ones — publishing says nothing about a price below cost or a stock
     figure that jumped, and resolving those here would hide them. */
  const settled = await db.inventoryAlert.updateMany({
    where: {
      productId: id,
      isResolved: false,
      type: {
        in: [
          "NEW_FROM_SOURCE",
          "URGENT_MISSING_MEDIA",
          "MISSING_IMAGE",
          "MISSING_MODEL",
          "DUPLICATE_MODEL",
          "DUPLICATE_SKU",
          "UNMATCHED_ROW",
          "MANUAL_URGENT",
          "MANUAL_ATTENTION",
        ],
      },
    },
    data: { isResolved: true, resolvedAt: new Date(), resolvedById: session.sub },
  });
  await logAudit({
    actorId: session.sub,
    action: "PRODUCT_PUBLISHED",
    entityType: "Product",
    entityId: id,
    metadata: { from: "off-site-page", clearedFlag: p.enrichmentStatus, alertsResolved: settled.count },
  });
  revalidatePath("/admin/inventory/problems");
  revalidatePath("/admin/inventory");
  revalidatePath(`/admin/inventory/${id}`);
  revalidatePath(`/product/${p.slug}`);
  return { success: true, error: null, title: p.title };
}
