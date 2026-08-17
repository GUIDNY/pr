import { createHash } from "crypto";
import { categoryForSheet, type SourceKey } from "./sheet-map";
import type { NormalizedProductRow, ParsedRow, RowIssue } from "./types";

function isMappedSourceKey(key: string): key is SourceKey {
  return key === "electronics" || key === "small-appliances" || key === "white-goods-screens";
}

function firstNumber(values?: (string | number)[]): number | null {
  if (!values || values.length === 0) return null;
  const n = Number(values[0]);
  return Number.isFinite(n) ? n : null;
}

function sumNumbers(values?: (string | number)[]): number | null {
  if (!values || values.length === 0) return null;
  const sum = values.reduce((acc: number, v) => acc + (Number(v) || 0), 0);
  return sum;
}

function firstString(values?: (string | number)[]): string | null {
  if (!values || values.length === 0) return null;
  const v = String(values[0]).trim();
  return v || null;
}

function syntheticSku(sourceKey: string, sheetName: string, rowIndex: number, seed: string) {
  const hash = createHash("sha1").update(`${sourceKey}|${sheetName}|${rowIndex}|${seed}`).digest("hex").slice(0, 10);
  return `NOSKU-${hash}`;
}

export function normalizeRow(
  sourceKey: string,
  sheetName: string,
  row: ParsedRow,
  categoryOverride?: string | null
): NormalizedProductRow {
  const issues: RowIssue[] = [];

  const realSku = firstString(row.values.SKU);
  const model = firstString(row.values.MODEL);
  const brandName = firstString(row.values.BRAND);
  const description = firstString(row.values.DESCRIPTION);
  const color = firstString(row.values.COLOR);
  const warranty = firstString(row.values.WARRANTY);
  const imageUrlRaw = firstString(row.values.IMAGE_URL);
  const imageUrl = imageUrlRaw && /^https?:\/\//i.test(imageUrlRaw) ? imageUrlRaw : null;

  const title = [brandName, model].filter(Boolean).join(" ") || description || `${sheetName} #${row.rowIndex}`;

  if (!model && !description) {
    issues.push({ type: "MISSING_MODEL", message: "אין דגם או תיאור מזהה לשורה זו" });
  }

  const skuIsSynthetic = !realSku;
  const sku = realSku ?? syntheticSku(sourceKey, sheetName, row.rowIndex, title);

  const retailPrice = firstNumber(row.values.RETAIL_PRICE);
  const minSalePrice = firstNumber(row.values.MIN_SALE_PRICE);
  const internalCost = firstNumber(row.values.INTERNAL_COST) ?? firstNumber(row.values.MANAGER_PRICE);

  if (retailPrice !== null && retailPrice <= 0) {
    issues.push({ type: "INVALID_PRICE", message: `מחיר לא תקין: ${retailPrice}` });
  }

  const sellableStock = sumNumbers(row.values.SELLABLE_STOCK);
  const warehouseStock = sumNumbers(row.values.WAREHOUSE_STOCK);
  const showroomStock = sumNumbers(row.values.SHOWROOM_STOCK);
  const supplierStock = sumNumbers(row.values.SUPPLIER_STOCK);
  const bondedStock = sumNumbers(row.values.BONDED_STOCK);

  for (const [label, val] of [
    ["sellable", sellableStock],
    ["warehouse", warehouseStock],
    ["showroom", showroomStock],
    ["supplier", supplierStock],
    ["bonded", bondedStock],
  ] as const) {
    if (val !== null && val < 0) {
      issues.push({ type: "NEGATIVE_STOCK", message: `מלאי שלילי (${label}): ${val}` });
    }
  }

  return {
    sourceKey,
    sheetName,
    rowIndex: row.rowIndex,
    categorySlug: categoryOverride ?? (isMappedSourceKey(sourceKey) ? categoryForSheet(sourceKey, sheetName) : null),
    sku,
    skuIsSynthetic,
    model,
    brandName,
    title,
    color,
    warranty,
    imageUrl,
    retailPrice,
    minSalePrice,
    internalCost,
    sellableStock,
    warehouseStock,
    showroomStock,
    supplierStock,
    bondedStock,
    rawSnapshot: row.raw,
    issues,
  };
}

// Flags rows within a single parse batch that share a SKU or (brand+model) —
// a genuine data-quality issue in the source, not something to silently
// pick one and discard the other.
export function findDuplicates(rows: NormalizedProductRow[]) {
  const bySku = new Map<string, NormalizedProductRow[]>();
  const byModel = new Map<string, NormalizedProductRow[]>();

  for (const row of rows) {
    if (!row.skuIsSynthetic) {
      const key = row.sku;
      if (!bySku.has(key)) bySku.set(key, []);
      bySku.get(key)!.push(row);
    }
    if (row.model) {
      const key = `${(row.brandName ?? "").toLowerCase()}|${row.model.toLowerCase()}`;
      if (!byModel.has(key)) byModel.set(key, []);
      byModel.get(key)!.push(row);
    }
  }

  const duplicateSkus = [...bySku.entries()].filter(([, v]) => v.length > 1);
  const duplicateModels = [...byModel.entries()].filter(([, v]) => v.length > 1);

  for (const [, group] of duplicateSkus) {
    for (const row of group) {
      row.issues.push({ type: "DUPLICATE_SKU", message: `מק"ט ${row.sku} מופיע ${group.length} פעמים במקור` });
    }
  }
  for (const [, group] of duplicateModels) {
    for (const row of group) {
      row.issues.push({ type: "DUPLICATE_MODEL", message: `דגם ${row.model} מופיע ${group.length} פעמים במקור` });
    }
  }

  return { duplicateSkus, duplicateModels };
}
