"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { runFullSync } from "@/lib/inventory/sync";
import { uploadInventoryFile } from "@/lib/inventory/storage";
import { stampSourceRowKeys } from "@/lib/inventory/backfill-row-keys";
import { INVENTORY_SOURCES } from "@/lib/inventory/sheet-map";
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

  const known = INVENTORY_SOURCES.find((s) => s.key === key);
  if (!known) return { success: false, error: "מקור לא מוכר" };

  // The last moment the products' recorded row positions and the file that
  // produced them still agree. A product created from a row with no SKU is
  // recognised on the next sync by sourceRowKey, and one that has never
  // been synced since the column existed does not have a key yet — so it
  // gets one now, from the outgoing file, before the incoming sheet shifts
  // every row under an insertion and the position match stops working.
  // Without this the fallback would be the product's current brand, model
  // and title, which is precisely what the admin and the enrichment agent
  // rewrite, and the sync would create a second copy of a curated product.
  //
  // Best-effort on purpose: an unreadable outgoing file is not a reason to
  // refuse a new one. It only leaves us where we were before this ran.
  const previous = await db.inventorySource.findUnique({
    where: { key },
    select: { id: true, key: true, sourceType: true, storagePath: true, sheetUrl: true, categorySlugOverride: true },
  });
  if (previous) {
    const needKeys = await db.product.count({
      where: { sourceId: previous.id, isTemporarySku: true, sourceRowKey: null },
    });
    if (needKeys > 0) {
      try {
        await stampSourceRowKeys(previous, { apply: true });
      } catch {
        // swallowed — see above
      }
    }
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  // Storage object keys must be ASCII — real (often Hebrew) filenames are
  // kept in the DB `filename` column for display instead.
  const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : ".xlsx";
  const storagePath = `${key}/${Date.now()}${ext}`;

  try {
    await uploadInventoryFile(
      storagePath,
      bytes,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "העלאה נכשלה" };
  }

  // fileHash is intentionally left untouched here (not set to the just-
  // uploaded content's hash) — runFullSync compares the fetched content's
  // hash against the stored one to decide whether to skip a scan. Setting
  // it here would make the very next sync see "unchanged" and skip
  // importing this file's rows entirely.
  await db.inventorySource.upsert({
    where: { key },
    update: {
      filename: file.name,
      storagePath,
      fileSizeBytes: bytes.length,
      isActive: true,
      uploadedById: session.sub,
      uploadedAt: new Date(),
    },
    create: {
      key,
      filename: file.name,
      storagePath,
      fileSizeBytes: bytes.length,
      isActive: true,
      uploadedById: session.sub,
    },
  });

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

export async function toggleSourceActiveAction(id: string, isActive: boolean) {
  const session = await requireAdmin();
  await db.inventorySource.update({ where: { id }, data: { isActive } });
  await logAudit({
    actorId: session.sub,
    action: isActive ? "INVENTORY_SOURCE_ACTIVATED" : "INVENTORY_SOURCE_DEACTIVATED",
    entityType: "InventorySource",
    entityId: id,
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
