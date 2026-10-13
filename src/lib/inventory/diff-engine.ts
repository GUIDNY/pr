import type { InventoryChangeType, StockStatus } from "@/lib/enums";
import type { NormalizedProductRow, StockLine } from "./types";

export type ExistingProductSnapshot = {
  id: string;
  sku: string;
  isTemporarySku: boolean;
  sourceId: string | null;
  price: number;
  stockQty: number;
  title: string;
  model: string | null;
  missingFromSourceSince: Date | null;
};

export type FieldChange = { changeType: InventoryChangeType; previousValue: unknown; newValue: unknown };

const MAJOR_STOCK_SWING = 20; // absolute unit delta considered "unexpected" for a MAJOR_STOCK_CHANGE alert

type StockLineRow = { stockLines: StockLine[] };

// A blank cell and a confirmed zero look identical in a spreadsheet — this
// tells them apart. If literally no stock column had any value for this row
// (not even a confirmed zero), we don't actually know the stock, and
// asserting OUT_OF_STOCK would be reporting information that was never given.
export function hasAnyStockData(row: StockLineRow): boolean {
  return row.stockLines.length > 0;
}

// Total Stock = sum of every named source. The one exception: if the source
// already provides its own running total (a "יתרה" column, classified
// SELLABLE_STOCK), trust that instead of summing everything else on top of
// it — otherwise the same units would be counted twice.
export function totalStock(row: StockLineRow): number {
  const totalColumn = row.stockLines.find((l) => l.field === "SELLABLE_STOCK");
  if (totalColumn) return Math.max(0, totalColumn.quantity);
  const sum = row.stockLines.reduce((acc, l) => acc + l.quantity, 0);
  return Math.max(0, sum);
}

// Every non-total-column stock line, positive quantities only — this is
// exactly what the admin "פירוט מלאי" breakdown modal shows and what gets
// persisted as InventorySourceLine rows.
export function displayStockLines(row: StockLineRow): StockLine[] {
  return row.stockLines.filter((l) => l.field !== "SELLABLE_STOCK" && l.quantity > 0);
}

// A price candidate at or below the supplier's own ex-VAT cost is not a
// price. This floor was half of cost until 13 October, on the reasoning that
// a shop does sell at or under cost — clearance, a display unit, a
// thin-margin headline model. The owner's rule is the opposite and he has
// now stated it twice, the second time as a description of the row itself:
// "the lowest number on the row is our cost, and the one after it is the
// price we sell at."
//
// Read that way the floor is not a heuristic about typos at all, it is what
// tells the cost apart from the prices — and it has to be strict, because
// the supplier writes the cost into a price column often enough to matter.
// Three products were live at exactly their own cost: a Bosch PXV975DV1E
// cooktop at 6,800 with four in stock (`מינימום למכירה` repeats the cost),
// an LG 55UA8000 at 1,900 (`קוד מנכ"ל` repeats it) and a Kenwood kMix at
// 1,290 (`מחיר מינ'` repeats it). Half-of-cost cannot see any of them: the
// number is the cost exactly, so it clears a floor set below the cost.
//
// A fourth was worse and is the case that settles it. `מיקסרים` row 115
// carries a single cell — `1` — and no price at all, so 1 ₪ was both the
// cost and the only candidate. A Sauter grinder attachment was live and
// orderable at one shekel with four units in stock. Strictly above cost
// leaves that row with no usable candidate, the price null, and the product
// off the site, which is the only right answer for a row that does not
// carry a price.
//
// Measured over the whole price list: 25 of 3,312 priced rows resolve at or
// under their own cost, and over the live catalogue the change moves five
// prices and takes nothing off the site.
const COST_FLOOR_EXCLUSIVE = true;

// The website price is the lowest of whatever resale-price columns the
// source actually gives — "מחיר מינימום", "מחיר מוצג", "קוד מנכ״ל", however
// many of these a sheet happens to have. Never the cost/supplier column,
// never a computed markup.
//
// Lowest-wins is right for a shop and wrong for a typo, and that asymmetry
// is the whole reason for the floor below. Three columns hold the same
// price three ways, so two of them agreeing means nothing: one dropped
// digit in the third is always the minimum, and always wins. That is what
// put a Miele pyrolytic oven on the site at 690 ₪ — its "מינימום למכירה"
// cell reads 690 where the row's other two columns say 6,800 and 6,200 —
// and an LG four-door fridge at 1,400 ₪ beside its own 11,600 and 13,290.
// Both were live and orderable. Neither looked like an error anywhere: the
// number is well-formed, the row parses, the product publishes.
//
// The sheet carries its own contradiction in the next column over. "עלות
// ללא מעמ" is what the supplier charges for the unit, and no resale price
// is a fraction of it. So a candidate under the floor is dropped and the
// next-cheapest survivor is used; if every candidate fails, the price is
// null, which the caller already treats as NEEDS_REVIEW and refuses to
// publish. The rejected values are returned rather than swallowed so the
// sync can say what it threw away and why.
export function resolvedPrice(
  row: Pick<
    NormalizedProductRow,
    "retailPrice" | "minSalePrice" | "managerPrice" | "internalCost"
  >
): { price: number | null; rejected: number[] } {
  const candidates = [row.retailPrice, row.minSalePrice, row.managerPrice].filter(
    (p): p is number => p !== null
  );
  const floor =
    row.internalCost !== null && row.internalCost > 0 && COST_FLOOR_EXCLUSIVE
      ? row.internalCost
      : null;
  if (floor === null) {
    // No cost column on this sheet, so there is nothing to check against and
    // nothing to reject. Same behaviour as before the floor existed.
    return { price: candidates.length ? Math.min(...candidates) : null, rejected: [] };
  }
  const usable = candidates.filter((p) => p > floor);
  const rejected = candidates.filter((p) => p <= floor);
  return { price: usable.length ? Math.min(...usable) : null, rejected };
}

export function deriveStockStatus(row: NormalizedProductRow, stock: number, hasConflict: boolean): StockStatus {
  if (hasConflict) return "NEEDS_REVIEW";
  if (row.issues.some((i) => i.type === "MISSING_MODEL" || i.type === "INVALID_PRICE")) return "NEEDS_REVIEW";
  if (!hasAnyStockData(row)) return "NEEDS_REVIEW";
  if (stock <= 0) {
    const hasSupplierOrBonded = row.stockLines.some(
      (l) => (l.field === "SUPPLIER_STOCK" || l.field === "BONDED_STOCK") && l.quantity > 0
    );
    if (hasSupplierOrBonded) return "SUPPLIER_STOCK";
    const hasShowroom = row.stockLines.some((l) => l.field === "SHOWROOM_STOCK" && l.quantity > 0);
    if (hasShowroom) return "DISPLAY_ONLY";
    return "OUT_OF_STOCK";
  }
  return "IN_STOCK"; // LOW_STOCK is applied by the caller against the configured threshold
}

// Pure comparison — no DB access — so it's independently testable and reused
// by both the real sync and a "dry run" preview.
export function diffAgainstExisting(
  row: NormalizedProductRow,
  existing: ExistingProductSnapshot | null,
  /**
   * The quantity actually written, when the caller has already decided it.
   *
   * The sheet's figure and the figure we store are not always the same
   * number: applyOneRow refuses a quantity that is really a price — the
   * supplier typed 9900 into the stock column of a ₪12,900 fridge — and
   * keeps what the product already had. The change log did not know that.
   * It recomputed the stock from the raw row, so the 12 October run
   * recorded six Samsung fridges jumping to 9,900, 9,901, 7,901, 6,901 and
   * 5,002 units. Not one of those was written: the guard held and the
   * stored quantities are still 0, 2, 1, 1 and 2.
   *
   * That is worse than a cosmetic wrong number on the changes page,
   * because MAJOR_STOCK_CHANGE alerts are raised off these rows — so the
   * back office reported a stock explosion that had already been refused,
   * on the one screen a person reads to find out what the sync did.
   *
   * Omitted (a dry run, or a caller that has not applied anything) it falls
   * back to the sheet's own total, which is the honest answer when nothing
   * has been decided yet.
   */
  appliedStock?: number,
  /**
   * The price actually written, when the caller has already decided it.
   *
   * Same argument as appliedStock and found the same way — by reading the
   * changes page against the products. This morning's run logged 32 price
   * changes and wrote almost none of them: a Fratelli gas cooktop
   * "changed" from ₪1,500 to ₪11,000 and is still ₪1,500, a Siemens
   * fridge from ₪10,400 to ₪3,500 and is still ₪10,400. The sync is not
   * allowed to overwrite a price whose row it cannot assert — see
   * adoptPrice in sync.ts, and the SKU-less rows that bound a ₪590 cooktop
   * to a ₪3,100 row are why — so the sheet's figure and the stored figure
   * routinely differ on purpose.
   *
   * Logging the sheet's number as a change that happened turns the one
   * screen a person opens to see what the sync did into fiction, and the
   * numbers it invents are alarming ones. Where the sheet disagrees and we
   * did not adopt it is a real thing worth seeing, and it has its own
   * screen — the price-gap tab, which reads the sheet live rather than
   * replaying a log.
   *
   * `null` means "nothing was written", and produces no price event at
   * all. Omitted falls back to the row's own figure, for a dry run or a
   * caller that has decided nothing.
   */
  appliedPrice?: number | null,
): FieldChange[] {
  const changes: FieldChange[] = [];
  const newStock = appliedStock ?? totalStock(row);

  if (!existing) {
    changes.push({ changeType: "NEW_PRODUCT", previousValue: null, newValue: { sku: row.sku, title: row.title } });
    return changes;
  }

  const written =
    appliedPrice === undefined ? (resolvedPrice(row).price ?? null) : appliedPrice;
  if (written !== null && written !== existing.price) {
    changes.push({ changeType: "PRICE_CHANGED", previousValue: existing.price, newValue: written });
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
