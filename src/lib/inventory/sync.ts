import { createHash } from "crypto";
import { db } from "@/lib/db";
import type { NormalizedProductRow } from "./types";
import {
  diffAgainstExisting,
  detectSourceConflicts,
  isMajorStockChange,
  totalStock,
  deriveStockStatus,
  resolvedPrice,
  hasAnyStockData,
} from "./diff-engine";
import type { SourceKey } from "./sheet-map";
import type { SyncTrigger } from "@/lib/enums";

export function getLowStockThreshold(): number {
  const raw = process.env.LOW_STOCK_THRESHOLD;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : 3;
}

function asciiSlug(input: string) {
  return input
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();
}

function slugFor(row: NormalizedProductRow) {
  const base = asciiSlug(row.model ?? row.brandName ?? row.categorySlug ?? "product") || "product";
  const suffix = createHash("sha1").update(row.sku).digest("hex").slice(0, 8);
  return `${base}-${suffix}`;
}

async function resolveBrandId(name: string | null): Promise<string> {
  const brandName = (name ?? "לא ידוע").trim() || "לא ידוע";
  const existing = await db.brand.findFirst({ where: { name: brandName } });
  if (existing) return existing.id;
  const slug = asciiSlug(brandName) || createHash("sha1").update(brandName).digest("hex").slice(0, 10);
  const created = await db.brand.create({
    data: { name: brandName, slug: `${slug}-${createHash("sha1").update(brandName).digest("hex").slice(0, 6)}` },
  });
  return created.id;
}

async function resolveCategoryId(slug: string | null): Promise<string | null> {
  if (!slug) return null;
  const cat = await db.category.findUnique({ where: { slug } });
  return cat?.id ?? null;
}

type AlertInput = {
  type: string;
  severity: string;
  productId?: string | null;
  sourceId?: string | null;
  syncRunId?: string | null;
  sourceSku?: string | null;
  message: string;
};

// A persisting issue (still no confirmed price, still out of stock, etc.)
// would otherwise get a brand new alert row every single sync run forever
// — resolve whatever unresolved alert of the same type already exists for
// this product/source before creating the current one, so the alert list
// reflects the current state, not sync history.
async function upsertAlert(input: AlertInput) {
  const where = input.productId
    ? { type: input.type, productId: input.productId, isResolved: false }
    : { type: input.type, sourceId: input.sourceId ?? undefined, productId: null, isResolved: false };
  await db.inventoryAlert.updateMany({ where, data: { isResolved: true, resolvedAt: new Date() } });
  await db.inventoryAlert.create({ data: input });
}

type ApplyResult = {
  productsAdded: number;
  productsUpdated: number;
  priceChanges: number;
  stockChanges: number;
  seenSkus: Set<string>;
};

export async function applyRowsForSource(
  sourceId: string,
  rows: NormalizedProductRow[],
  syncRunId: string,
  conflictSkus: Set<string>
): Promise<ApplyResult> {
  const threshold = getLowStockThreshold();
  const result: ApplyResult = {
    productsAdded: 0,
    productsUpdated: 0,
    priceChanges: 0,
    stockChanges: 0,
    seenSkus: new Set(),
  };

  for (const row of rows) {
    result.seenSkus.add(row.sku); // safety net for the early-exit path below
    const hasConflict = conflictSkus.has(row.sku);

    const categoryId = await resolveCategoryId(row.categorySlug);
    if (!categoryId) {
      await upsertAlert({
        type: "UNMATCHED_ROW",
        severity: "WARNING",
        sourceId,
        syncRunId,
        sourceSku: row.sku,
        message: `לא נמצאה קטגוריה מתאימה לגיליון "${row.sheetName}"`,
      });
      continue;
    }

    // Prefer matching by physical position in the source (sourceId + sheet +
    // row) over the SKU when the row's SKU is synthetic — a header cell
    // typo/edit or a one-off parse hiccup can make a real SKU column drop
    // out on a single sync, and matching by SKU alone would then create a
    // duplicate product instead of updating the one that's actually there.
    const existing = row.skuIsSynthetic
      ? (await db.product.findFirst({
          where: { sourceId, sourceSheet: row.sheetName, sourceRowRef: row.rowIndex },
        })) ?? (await db.product.findUnique({ where: { sku: row.sku } }))
      : await db.product.findUnique({ where: { sku: row.sku } });
    const stock = totalStock(row);
    const { price: resolved, isConfirmed: priceConfirmed } = resolvedPrice(row);
    let status = deriveStockStatus(row, stock, hasConflict);
    if (status !== "NEEDS_REVIEW" && !priceConfirmed) status = "NEEDS_REVIEW";
    const finalStatus = status === "IN_STOCK" && stock <= threshold ? "LOW_STOCK" : status;

    const changes = diffAgainstExisting(
      row,
      existing
        ? {
            id: existing.id,
            sku: existing.sku,
            sourceId: existing.sourceId,
            price: existing.price,
            stockQty: existing.stockQty,
            sellableStock: existing.sellableStock,
            warehouseStock: existing.warehouseStock,
            showroomStock: existing.showroomStock,
            supplierStock: existing.supplierStock,
            bondedStock: existing.bondedStock,
            title: existing.title,
            model: existing.model,
            missingFromSourceSince: existing.missingFromSourceSince,
          }
        : null
    );

    const brandId = await resolveBrandId(row.brandName);

    // Never let a synthetic fallback SKU clobber a real one already on
    // record for this exact source position — e.g. from the header-typo
    // scenario above, where the row-position match finds a product with a
    // real SKU but this pass only produced a synthetic one for it.
    const sku = row.skuIsSynthetic && existing && !existing.sku.startsWith("NOSKU-") ? existing.sku : row.sku;
    result.seenSkus.add(sku);

    const data = {
      sku,
      title: row.title,
      model: row.model,
      brandId,
      categoryId,
      price: resolved ?? existing?.price ?? 0,
      minSalePrice: row.minSalePrice,
      supplierCost: row.internalCost,
      warrantyMonths: existing?.warrantyMonths ?? 12,
      stockStatus: finalStatus,
      stockQty: stock,
      sellableStock: row.sellableStock,
      warehouseStock: row.warehouseStock,
      showroomStock: row.showroomStock,
      supplierStock: row.supplierStock,
      bondedStock: row.bondedStock,
      stockBreakdown: JSON.stringify(row.rawSnapshot),
      internalNotes: row.color ? `צבע: ${row.color}` : null,
      sourceId,
      sourceSheet: row.sheetName,
      sourceRowRef: row.rowIndex,
      lastExcelSyncAt: new Date(),
      missingFromSourceSince: null,
      // Store policy: zero stock means fully off the site, not just
      // "published but shows out of stock" — enforced again at query time
      // in src/lib/queries/products.ts (PUBLIC_PRODUCT_WHERE) since that's
      // the layer that actually can't go stale.
      isPublished: !hasConflict && finalStatus !== "NEEDS_REVIEW" && priceConfirmed && resolved !== null && stock > 0,
    };

    let productId: string;
    if (existing) {
      await db.product.update({ where: { id: existing.id }, data });
      productId = existing.id;
      result.productsUpdated++;
      if (existing.missingFromSourceSince) {
        await db.inventoryAlert.updateMany({
          where: { type: "MISSING_FROM_SOURCE", productId, isResolved: false },
          data: { isResolved: true, resolvedAt: new Date() },
        });
      }
    } else {
      const created = await db.product.create({
        data: { ...data, slug: slugFor(row), shortDescription: row.color ? `צבע: ${row.color}` : null },
      });
      productId = created.id;
      result.productsAdded++;
    }

    // Image URL comes only from an explicit column in the source — never
    // guessed/searched — so it's safe to trust and apply directly.
    if (row.imageUrl) {
      const existingImage = await db.productImage.findFirst({ where: { productId } });
      if (!existingImage) {
        await db.productImage.create({ data: { productId, url: row.imageUrl, sortOrder: 0 } });
      } else if (existingImage.url !== row.imageUrl) {
        await db.productImage.update({ where: { id: existingImage.id }, data: { url: row.imageUrl } });
      }
    }

    for (const change of changes) {
      if (change.changeType === "PRICE_CHANGED") result.priceChanges++;
      if (
        change.changeType === "STOCK_INCREASED" ||
        change.changeType === "STOCK_DECREASED" ||
        change.changeType === "BECAME_OUT_OF_STOCK" ||
        change.changeType === "BACK_IN_STOCK"
      ) {
        result.stockChanges++;
      }
      await db.inventoryChangeEvent.create({
        data: {
          syncRunId,
          productId,
          sourceId,
          sourceSku: row.sku,
          sourceSheet: row.sheetName,
          changeType: change.changeType,
          previousValue: change.previousValue === null ? null : JSON.stringify(change.previousValue),
          newValue: change.newValue === null ? null : JSON.stringify(change.newValue),
        },
      });
      if (
        (change.changeType === "STOCK_INCREASED" || change.changeType === "STOCK_DECREASED") &&
        typeof change.previousValue === "number" &&
        typeof change.newValue === "number" &&
        isMajorStockChange(change.previousValue, change.newValue)
      ) {
        await upsertAlert({
          type: "MAJOR_STOCK_CHANGE",
          severity: "WARNING",
          productId,
          sourceId,
          syncRunId,
          sourceSku: row.sku,
          message: `שינוי מלאי חריג ב-${row.title}: ${change.previousValue} → ${change.newValue}`,
        });
      }
    }

    if (finalStatus === "OUT_OF_STOCK") {
      await upsertAlert({ type: "OUT_OF_STOCK", severity: "INFO", productId, sourceId, syncRunId, sourceSku: row.sku, message: `${row.title} אזל מהמלאי` });
    } else if (finalStatus === "LOW_STOCK") {
      await upsertAlert({ type: "LOW_STOCK", severity: "INFO", productId, sourceId, syncRunId, sourceSku: row.sku, message: `${row.title}: נותרו ${stock} יחידות בלבד` });
    }

    if (!hasAnyStockData(row)) {
      await upsertAlert({
        type: "UNMATCHED_ROW",
        severity: "WARNING",
        productId,
        sourceId,
        syncRunId,
        sourceSku: row.sku,
        message: `${row.title}: אין נתוני מלאי כלל במקור — לא פורסם, מצריך בדיקה`,
      });
    }
    if (!priceConfirmed) {
      await upsertAlert({
        type: "INVALID_PRICE",
        severity: "WARNING",
        productId,
        sourceId,
        syncRunId,
        sourceSku: row.sku,
        message:
          resolved !== null
            ? `${row.title}: אין מחיר אתר מאושר במקור — נעשה שימוש זמני במחיר מינימום (₪${resolved}), לא פורסם`
            : `${row.title}: אין מחיר כלל במקור — לא פורסם`,
      });
    }

    for (const issue of row.issues) {
      const typeMap = {
        MISSING_MODEL: "MISSING_MODEL",
        INVALID_PRICE: "INVALID_PRICE",
        NEGATIVE_STOCK: "NEGATIVE_STOCK",
        DUPLICATE_SKU: "DUPLICATE_SKU",
        DUPLICATE_MODEL: "DUPLICATE_MODEL",
        UNMATCHED_ROW: "UNMATCHED_ROW",
      } as const;
      await upsertAlert({
        type: typeMap[issue.type],
        severity: issue.type === "INVALID_PRICE" || issue.type === "NEGATIVE_STOCK" ? "CRITICAL" : "WARNING",
        productId,
        sourceId,
        syncRunId,
        sourceSku: row.sku,
        message: issue.message,
      });
    }

    if (hasConflict) {
      await upsertAlert({
        type: "SOURCE_CONFLICT",
        severity: "CRITICAL",
        productId,
        sourceId,
        syncRunId,
        sourceSku: row.sku,
        message: `מק"ט ${row.sku} מופיע ביותר ממקור פעיל אחד`,
      });
    }
  }

  return result;
}

export async function markMissingProducts(sourceId: string, seenSkus: Set<string>, syncRunId: string): Promise<number> {
  const stillLinked = await db.product.findMany({
    where: { sourceId, missingFromSourceSince: null },
    select: { id: true, sku: true, title: true },
  });
  const missing = stillLinked.filter((p) => !seenSkus.has(p.sku));

  for (const p of missing) {
    await db.product.update({
      where: { id: p.id },
      data: { missingFromSourceSince: new Date(), stockStatus: "NEEDS_REVIEW" },
    });
    await db.inventoryChangeEvent.create({
      data: {
        syncRunId,
        productId: p.id,
        sourceId,
        sourceSku: p.sku,
        changeType: "PRODUCT_MISSING_FROM_SOURCE",
        previousValue: null,
        newValue: null,
      },
    });
    await upsertAlert({
      type: "MISSING_FROM_SOURCE",
      severity: "WARNING",
      productId: p.id,
      sourceId,
      syncRunId,
      sourceSku: p.sku,
      message: `${p.title} נעלם מקובץ המקור — סומן לבדיקה, לא נמחק`,
    });
  }
  return missing.length;
}

export async function recordUnknownColumnAlerts(
  sourceId: string,
  syncRunId: string,
  sheetsWithUnknowns: { sheetName: string; unknownLabels: string[] }[]
) {
  for (const s of sheetsWithUnknowns) {
    if (s.unknownLabels.length === 0) continue;
    await upsertAlert({
      type: "UNKNOWN_COLUMN",
      severity: "INFO",
      sourceId,
      syncRunId,
      message: `גיליון "${s.sheetName}": עמודות לא מזוהות — ${s.unknownLabels.join(", ")}`,
    });
  }
}

export function conflictSkuSet(rows: NormalizedProductRow[]): Set<string> {
  return new Set(detectSourceConflicts(rows).map((c) => c.sku));
}

export type { SyncTrigger };

// The real, repeatable sync: reads each active source's current file from
// Supabase Storage, skips ones whose content hash hasn't changed since the
// last scan, and applies the rest — this is what both the manual "sync now"
// action and the scheduled Vercel Cron endpoint call. Swapping Excel for
// Priority ERP later means replacing how bytes are fetched here; the parse
// -> normalize -> diff -> apply pipeline underneath doesn't change.
export async function runFullSync(trigger: SyncTrigger, triggeredById?: string) {
  const { downloadInventoryFile, isStorageConfigured } = await import("./storage");
  const { parseWorkbook } = await import("./excel-parser");
  const { fetchSheetWorkbook, parseGoogleWorkbook, categoryForGoogleSheetTab, extractSpreadsheetId } = await import(
    "./google-sheets-source"
  );
  const { normalizeRow, findDuplicates } = await import("./normalizer");
  const { createHash } = await import("crypto");

  const syncRun = await db.inventorySyncRun.create({
    data: { trigger, triggeredById, status: "RUNNING", sourceIds: "[]" },
  });

  const sources = await db.inventorySource.findMany({ where: { isActive: true } });
  const scannedSourceIds: string[] = [];
  const allRows: NormalizedProductRow[] = [];
  const perSourceRows = new Map<string, NormalizedProductRow[]>();
  const perSourceUnknowns = new Map<string, { sheetName: string; unknownLabels: string[] }[]>();
  let totalRowsScanned = 0;
  let anyChanged = false;

  for (const source of sources) {
    await db.inventorySource.update({ where: { id: source.id }, data: { lastScannedAt: new Date() } });

    let sheets: { sheetName: string; unknownLabels: string[]; rows: import("./types").ParsedRow[] }[] = [];
    let contentHash: string;
    let contentSize: number;
    let categoryResolver: (sheetName: string) => string | null = () =>
      source.categorySlugOverride ?? null;

    try {
      if (source.sourceType === "GOOGLE_SHEET") {
        if (!source.sheetUrl) continue;
        const spreadsheetId = extractSpreadsheetId(source.sheetUrl);
        if (!spreadsheetId) throw new Error("קישור הגליון אינו תקין");
        const bytes = await fetchSheetWorkbook(spreadsheetId);
        contentHash = createHash("sha256").update(bytes).digest("hex");
        contentSize = bytes.length;
        if (contentHash === source.fileHash) continue; // unchanged
        const workbook = parseGoogleWorkbook(bytes, source.categorySlugOverride);
        sheets = workbook.sheets;
        categoryResolver = (sheetName) => categoryForGoogleSheetTab(sheetName, source.categorySlugOverride);
      } else {
        if (!isStorageConfigured() || !source.storagePath) continue;
        const bytes = await downloadInventoryFile(source.storagePath);
        contentHash = createHash("sha256").update(bytes).digest("hex");
        contentSize = bytes.length;
        if (contentHash === source.fileHash) continue; // unchanged
        const workbook = parseWorkbook(bytes, source.key as SourceKey);
        sheets = workbook.sheets;
      }
    } catch (err) {
      await upsertAlert({
        type: "UNMATCHED_ROW",
        severity: "CRITICAL",
        sourceId: source.id,
        syncRunId: syncRun.id,
        message: `נכשל בטעינת המקור: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }

    anyChanged = true;
    scannedSourceIds.push(source.id);

    perSourceUnknowns.set(
      source.id,
      sheets.filter((s) => s.unknownLabels.length > 0).map((s) => ({ sheetName: s.sheetName, unknownLabels: s.unknownLabels }))
    );

    const rows: NormalizedProductRow[] = [];
    for (const sheet of sheets) {
      totalRowsScanned += sheet.rows.length;
      for (const row of sheet.rows) {
        rows.push(normalizeRow(source.key, sheet.sheetName, row, categoryResolver(sheet.sheetName)));
      }
    }
    findDuplicates(rows);
    perSourceRows.set(source.id, rows);
    allRows.push(...rows);

    await db.inventorySource.update({
      where: { id: source.id },
      data: { fileHash: contentHash, fileSizeBytes: contentSize },
    });
  }

  if (!anyChanged) {
    await db.inventorySyncRun.update({
      where: { id: syncRun.id },
      data: { status: "NO_CHANGES", sourceIds: JSON.stringify(scannedSourceIds), finishedAt: new Date() },
    });
    return db.inventorySyncRun.findUniqueOrThrow({ where: { id: syncRun.id } });
  }

  const conflicts = conflictSkuSet(allRows);
  let productsAdded = 0,
    productsUpdated = 0,
    productsMissing = 0,
    priceChanges = 0,
    stockChanges = 0;

  for (const sourceId of scannedSourceIds) {
    const rows = perSourceRows.get(sourceId) ?? [];
    const result = await applyRowsForSource(sourceId, rows, syncRun.id, conflicts);
    productsAdded += result.productsAdded;
    productsUpdated += result.productsUpdated;
    priceChanges += result.priceChanges;
    stockChanges += result.stockChanges;
    productsMissing += await markMissingProducts(sourceId, result.seenSkus, syncRun.id);
    await recordUnknownColumnAlerts(sourceId, syncRun.id, perSourceUnknowns.get(sourceId) ?? []);
    await db.inventorySource.update({ where: { id: sourceId }, data: { lastSyncedAt: new Date() } });
  }

  const errorCount = await db.inventoryAlert.count({ where: { syncRunId: syncRun.id, severity: "CRITICAL" } });

  return db.inventorySyncRun.update({
    where: { id: syncRun.id },
    data: {
      status: "SUCCESS",
      sourceIds: JSON.stringify(scannedSourceIds),
      rowsScanned: totalRowsScanned,
      productsAdded,
      productsUpdated,
      productsMissing,
      priceChanges,
      stockChanges,
      errorCount,
      finishedAt: new Date(),
    },
  });
}
