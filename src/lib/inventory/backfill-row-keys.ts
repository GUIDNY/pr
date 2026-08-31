// Stamps Product.sourceRowKey onto the products a source has already
// created, reading the source file *currently* in storage.
//
// This is the catch-up half of sourceRowKey. The forward half lives in
// sync.ts, which writes the key on every row it creates or matches. That
// only helps a product whose row is still where the database thinks it is
// — and a product whose row has moved is exactly the one the key exists to
// rescue. So the keys have to be written from the file that produced the
// current positions, which is the file sitting in storage right now,
// before a new sheet replaces it.
//
// Hence the two callers:
//
//   • uploadInventorySourceAction, before it points the source at newly
//     uploaded bytes. That is the last moment the old positions and the
//     old file still agree, and it is the moment a supplier's new sheet
//     arrives — which is the event this whole mechanism is about.
//   • scripts/backfill-source-row-keys.ts, for the one-time catch-up on
//     everything already in the catalog.
//
// Matching is by position and nothing else. Deliberately not
// findExistingProduct: its last resort is the brand/model/title comparison
// that sourceRowKey exists to replace, and a wrong match here would stamp
// a wrong identity permanently.
import { db } from "@/lib/db";
import { normalizeRow } from "./normalizer";
import { brandLikeDividers } from "./brand-extractor";
import { sourceRowKeyFor } from "./source-row-key";
import type { SourceKey } from "./sheet-map";
import type { ParsedSheet } from "./types";

export type StampedKey = {
  productId: string;
  sku: string;
  title: string;
  sheet: string;
  rowIndex: number;
  key: string;
};

export type StampResult = {
  sourceKey: string;
  /** Why nothing could be read, when that is the case. */
  skipped: string | null;
  rowsRead: number;
  realSkuRows: number;
  noKeyDerivable: number;
  noProductAtPosition: number;
  notTemporary: number;
  alreadyKeyed: number;
  /** Two rows hashed to the same key — a key that names two products names
   *  neither, so none of them is written. */
  collidedProductIds: string[];
  written: StampedKey[];
};

type SourceRecord = {
  id: string;
  key: string;
  sourceType: string;
  storagePath: string | null;
  sheetUrl: string | null;
  categorySlugOverride: string | null;
};

async function loadSheets(
  source: SourceRecord,
): Promise<{ sheets: ParsedSheet[]; categoryFor: (sheet: string) => string | null } | null> {
  if (source.sourceType === "GOOGLE_SHEET") {
    const { fetchSheetWorkbook, parseGoogleWorkbook, categoryForGoogleSheetTab, extractSpreadsheetId } =
      await import("./google-sheets-source");
    if (!source.sheetUrl) return null;
    const id = extractSpreadsheetId(source.sheetUrl);
    if (!id) return null;
    const workbook = parseGoogleWorkbook(await fetchSheetWorkbook(id), source.categorySlugOverride);
    return {
      sheets: workbook.sheets,
      categoryFor: (sheet) => categoryForGoogleSheetTab(sheet, source.categorySlugOverride),
    };
  }
  const { parseWorkbook } = await import("./excel-parser");
  const { downloadInventoryFile, isStorageConfigured } = await import("./storage");
  if (!isStorageConfigured() || !source.storagePath) return null;
  const workbook = parseWorkbook(await downloadInventoryFile(source.storagePath), source.key as SourceKey);
  return { sheets: workbook.sheets, categoryFor: () => source.categorySlugOverride ?? null };
}

export async function stampSourceRowKeys(
  source: SourceRecord,
  { apply }: { apply: boolean },
): Promise<StampResult> {
  const result: StampResult = {
    sourceKey: source.key,
    skipped: null,
    rowsRead: 0,
    realSkuRows: 0,
    noKeyDerivable: 0,
    noProductAtPosition: 0,
    notTemporary: 0,
    alreadyKeyed: 0,
    collidedProductIds: [],
    written: [],
  };

  let loaded;
  try {
    loaded = await loadSheets(source);
  } catch (err) {
    result.skipped = err instanceof Error ? err.message : String(err);
    return result;
  }
  if (!loaded) {
    result.skipped = "not readable (no storage path / sheet url, or storage not configured)";
    return result;
  }

  const candidates: StampedKey[] = [];
  const byKey = new Map<string, StampedKey[]>();

  for (const sheet of loaded.sheets) {
    // The same divider-derived brand hints the sync feeds normalizeRow, so
    // a row whose brand only appears on a yellow section header hashes here
    // exactly as it will there.
    const knownBrands = brandLikeDividers(
      sheet.rows.map((r) => r.sectionLabel).filter((l): l is string => l !== null),
    );

    for (const parsedRow of sheet.rows) {
      result.rowsRead++;
      const row = normalizeRow(
        source.key,
        sheet.sheetName,
        parsedRow,
        sheet.columns,
        loaded.categoryFor(sheet.sheetName),
        knownBrands,
      );
      if (!row.skuIsSynthetic) {
        result.realSkuRows++;
        continue;
      }
      const key = sourceRowKeyFor(row);
      if (!key) {
        result.noKeyDerivable++;
        continue;
      }

      const product = await db.product.findFirst({
        where: { sourceId: source.id, sourceSheet: sheet.sheetName, sourceRowRef: parsedRow.rowIndex },
        select: { id: true, sku: true, title: true, isTemporarySku: true, sourceRowKey: true },
      });
      if (!product) {
        result.noProductAtPosition++;
        continue;
      }
      if (!product.isTemporarySku) {
        result.notTemporary++;
        continue;
      }
      if (product.sourceRowKey === key) {
        result.alreadyKeyed++;
        continue;
      }

      const candidate: StampedKey = {
        productId: product.id,
        sku: product.sku,
        title: product.title,
        sheet: sheet.sheetName,
        rowIndex: parsedRow.rowIndex,
        key,
      };
      candidates.push(candidate);
      byKey.set(key, [...(byKey.get(key) ?? []), candidate]);
    }
  }

  const collided = new Set(
    [...byKey.values()]
      .filter((group) => new Set(group.map((c) => c.productId)).size > 1)
      .flat()
      .map((c) => c.productId),
  );
  result.collidedProductIds = [...collided];
  result.written = candidates.filter((c) => !collided.has(c.productId));

  if (apply) {
    for (const c of result.written) {
      await db.product.update({ where: { id: c.productId }, data: { sourceRowKey: c.key } });
    }
  }
  return result;
}
