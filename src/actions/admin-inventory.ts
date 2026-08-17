"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { runFullSync } from "@/lib/inventory/sync";
import { uploadInventoryFile } from "@/lib/inventory/storage";
import { INVENTORY_SOURCES } from "@/lib/inventory/sheet-map";
import { extractSpreadsheetId, extractGid, fetchSheetWorkbook } from "@/lib/inventory/google-sheets-source";

export async function runManualSyncAction() {
  const session = await requireAdmin();
  const run = await runFullSync("MANUAL", session.sub);
  await logAudit({ actorId: session.sub, action: "INVENTORY_SYNC_TRIGGERED", entityType: "InventorySyncRun", entityId: run.id });
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/inventory/history");
  revalidatePath("/admin");
  return { success: run.status !== "FAILED", status: run.status, error: run.errorMessage };
}

export async function uploadInventorySourceAction(formData: FormData) {
  const session = await requireAdmin();
  const file = formData.get("file") as File | null;
  const key = formData.get("key") as string | null;
  if (!file || !key) return { success: false, error: "חסר קובץ או מקור" };

  const known = INVENTORY_SOURCES.find((s) => s.key === key);
  if (!known) return { success: false, error: "מקור לא מוכר" };

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
  revalidatePath("/admin/inventory/sources");
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
