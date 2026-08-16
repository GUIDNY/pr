// Maps each real workbook + sheet (tab) to the closest existing category
// slug from src/lib/category-tree.ts. Built by inspecting the actual
// workbooks on 2026-08-17 — sheet names/structure are not guessed.
//
// Several sheets mix multiple sub-types with no per-row category column
// (e.g. "כיריים" has gas/ceramic/induction cooktops together, "מקררים" has
// every fridge configuration together). Rather than guess a specific
// sub-leaf wrong for hundreds of rows, those map to the closest category
// that safely covers the mix — a department-level category, or the most
// common sub-type. An admin can always correct an individual product's
// category from the catalog editor afterward.
//
// Sheets not listed here are not product data (lookup/reference tabs) and
// are skipped by the parser, surfaced as an UNMATCHED_ROW-adjacent note
// rather than silently ignored.

export type SourceKey = "electronics" | "small-appliances" | "white-goods-screens";

export const INVENTORY_SOURCES: { key: SourceKey; filename: string }[] = [
  { key: "electronics", filename: "מחירון מלאי אלקטרוניקה.xlsx" },
  { key: "small-appliances", filename: "מחירון ליין קטן.xlsx" },
  { key: "white-goods-screens", filename: "מחירון ליין לבן מסכים.xlsx" },
];

// sourceKey -> sheetName -> category slug (leaf or department)
export const SHEET_CATEGORY_MAP: Record<SourceKey, Record<string, string>> = {
  electronics: {
    "מקרנים+DVD+סטרימר סמארט +ממירים": "projectors",
    "רמקולים בידוריות ואוזניות": "speakers",
    "רסיברים ומערכות סטריאו": "receivers-amplifiers",
    " מתקניי תליה וכבלים": "tv-mounts",
  },
  "small-appliances": {
    "גריל גז ומערכות מים": "water-dispensers",
    "מוצרי חשמל לבית ולמטבח": "small-kitchen-appliances",
    "מיקסרים מעבדי מזון בלנדרים קוצצ": "food-processors",
    "טוסטרים+מצנמים": "toaster-ovens",
    "קומקומים+מיחמים": "kettles",
    מיקרוגלים: "microwaves",
    מגהצים: "irons",
    "שואבים ומכונות שטיפה": "vacuum-cleaners",
    "מוצרי טיפוח": "personal-care",
    "מאוררים + קטלנים ומטהרים": "fans",
    "מכונות קפה + מטחנות קפה ": "coffee-machines",
    "מוצרי חורף": "heaters",
  },
  "white-goods-screens": {
    כיריים: "gas-cooktops",
    "מסכים ": "tvs",
    "מ. כביסה": "washing-machines",
    מייבשים: "dryers",
    מדיחים: "dishwasher-standard",
    "ת.בנוי": "built-in-oven",
    "ת. משולב": "combi-oven",
    מקררים: "refrigeration",
    "מקפיאים ": "freezers",
    קולטים: "range-hoods",
    מזגנים: "split-ac",
  },
};

// Sheets that are not product listings (helper/lookup tabs) — skipped
// entirely rather than mis-imported as products.
export const NON_PRODUCT_SHEETS: Record<SourceKey, string[]> = {
  electronics: ["פילטר לקולט", 'קד"מ ספקים'],
  "small-appliances": [],
  "white-goods-screens": [],
};

export function categoryForSheet(sourceKey: SourceKey, sheetName: string): string | null {
  return SHEET_CATEGORY_MAP[sourceKey]?.[sheetName] ?? null;
}

export function isProductSheet(sourceKey: SourceKey, sheetName: string): boolean {
  return !(NON_PRODUCT_SHEETS[sourceKey] ?? []).includes(sheetName);
}
