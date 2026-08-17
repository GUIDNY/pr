import type { InventoryChangeType, StockStatus } from "@/lib/enums";
import type { NormalizedProductRow } from "./types";

export type ExistingProductSnapshot = {
  id: string;
  sku: string;
  sourceId: string | null;
  price: number;
  stockQty: number;
  sellableStock: number | null;
  warehouseStock: number | null;
  showroomStock: number | null;
  supplierStock: number | null;
  bondedStock: number | null;
  title: string;
  model: string | null;
  missingFromSourceSince: Date | null;
};

export type FieldChange = { changeType: InventoryChangeType; previousValue: unknown; newValue: unknown };

const MAJOR_STOCK_SWING = 20; // absolute unit delta considered "unexpected" for a MAJOR_STOCK_CHANGE alert

type StockFields = {
  sellableStock: number | null;
  warehouseStock: number | null;
  showroomStock: number | null;
  supplierStock: number | null;
  bondedStock: number | null;
};

// A blank cell and a confirmed zero look identical in a spreadsheet — this
// tells them apart. If literally none of the stock columns had a value for
// this row, we don't actually know the stock, and asserting OUT_OF_STOCK
// would be reporting information that was never given.
export function hasAnyStockData(row: StockFields): boolean {
  return (
    row.sellableStock !== null ||
    row.warehouseStock !== null ||
    row.showroomStock !== null ||
    row.supplierStock !== null ||
    row.bondedStock !== null
  );
}

export function totalStock(row: StockFields): number {
  if (row.sellableStock !== null) return Math.max(0, row.sellableStock);
  const sum =
    (row.warehouseStock ?? 0) + (row.showroomStock ?? 0) + (row.supplierStock ?? 0) + (row.bondedStock ?? 0);
  return Math.max(0, sum);
}

// Same idea as stock: a source row can leave the retail price column blank
// while still giving a minimum price. Prefer the confirmed retail price;
// fall back to the minimum only when there's nothing else, and let the
// caller know it's a fallback (unconfirmed) so it isn't silently published.
export function resolvedPrice(row: Pick<NormalizedProductRow, "retailPrice" | "minSalePrice">): {
  price: number | null;
  isConfirmed: boolean;
} {
  if (row.retailPrice !== null) return { price: row.retailPrice, isConfirmed: true };
  if (row.minSalePrice !== null) return { price: row.minSalePrice, isConfirmed: false };
  return { price: null, isConfirmed: false };
}

export function deriveStockStatus(row: NormalizedProductRow, stock: number, hasConflict: boolean): StockStatus {
  if (hasConflict) return "NEEDS_REVIEW";
  if (row.issues.some((i) => i.type === "MISSING_MODEL" || i.type === "INVALID_PRICE")) return "NEEDS_REVIEW";
  if (!hasAnyStockData(row)) return "NEEDS_REVIEW";
  if (stock <= 0) {
    if ((row.supplierStock ?? 0) > 0 || (row.bondedStock ?? 0) > 0) return "SUPPLIER_STOCK";
    if ((row.showroomStock ?? 0) > 0) return "DISPLAY_ONLY";
    return "OUT_OF_STOCK";
  }
  return "IN_STOCK"; // LOW_STOCK is applied by the caller against the configured threshold
}

// Pure comparison — no DB access — so it's independently testable and reused
// by both the real sync and a "dry run" preview.
export function diffAgainstExisting(
  row: NormalizedProductRow,
  existing: ExistingProductSnapshot | null
): FieldChange[] {
  const changes: FieldChange[] = [];
  const newStock = totalStock(row);

  if (!existing) {
    changes.push({ changeType: "NEW_PRODUCT", previousValue: null, newValue: { sku: row.sku, title: row.title } });
    return changes;
  }

  if (row.retailPrice !== null && row.retailPrice !== existing.price) {
    changes.push({ changeType: "PRICE_CHANGED", previousValue: existing.price, newValue: row.retailPrice });
  }

  const oldStock = existing.stockQty;
  if (newStock !== oldStock) {
    if (oldStock > 0 && newStock === 0) {
      changes.push({ changeType: "BECAME_OUT_OF_STOCK", previousValue: oldStock, newValue: newStock });
    } else if (oldStock === 0 && newStock > 0) {
      changes.push({ changeType: "BACK_IN_STOCK", previousValue: oldStock, newValue: newStock });
    } else if (newStock > oldStock) {
      changes.push({ changeType: "STOCK_INCREASED", previousValue: oldStock, newValue: newStock });
    } else {
      changes.push({ changeType: "STOCK_DECREASED", previousValue: oldStock, newValue: newStock });
    }
  }

  if ((row.supplierStock ?? null) !== (existing.supplierStock ?? null)) {
    changes.push({
      changeType: "SUPPLIER_STOCK_CHANGED",
      previousValue: existing.supplierStock,
      newValue: row.supplierStock,
    });
  }
  if ((row.showroomStock ?? null) !== (existing.showroomStock ?? null)) {
    changes.push({
      changeType: "SHOWROOM_STOCK_CHANGED",
      previousValue: existing.showroomStock,
      newValue: row.showroomStock,
    });
  }

  const dataChanged = row.title !== existing.title || (row.model ?? null) !== existing.model;
  if (dataChanged) {
    changes.push({
      changeType: "PRODUCT_DATA_CHANGED",
      previousValue: { title: existing.title, model: existing.model },
      newValue: { title: row.title, model: row.model },
    });
  }

  return changes;
}

export function isMajorStockChange(previous: number, next: number): boolean {
  return Math.abs(next - previous) >= MAJOR_STOCK_SWING;
}

// Cross-source SKU collisions: same real (non-synthetic) SKU claimed by rows
// from more than one active source in the same sync. Never silently pick
// one — surface it.
export function detectSourceConflicts(rows: NormalizedProductRow[]) {
  const bySku = new Map<string, NormalizedProductRow[]>();
  for (const row of rows) {
    if (row.skuIsSynthetic) continue;
    const list = bySku.get(row.sku) ?? [];
    list.push(row);
    bySku.set(row.sku, list);
  }
  const conflicts: { sku: string; rows: NormalizedProductRow[] }[] = [];
  for (const [sku, list] of bySku) {
    const distinctSources = new Set(list.map((r) => r.sourceKey));
    if (distinctSources.size > 1) conflicts.push({ sku, rows: list });
  }
  return conflicts;
}
