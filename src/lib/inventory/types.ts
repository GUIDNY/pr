export type ClassifiedField =
  | "SKU"
  | "MODEL"
  | "BRAND"
  | "DESCRIPTION"
  | "COLOR"
  // A bare "תאור" header (as opposed to "תאור מוצר"/"תיאור") — confirmed on
  // real data to sometimes hold the color/variant text instead of a
  // description, when a sheet already has a separate real description
  // column. Kept split from COLOR/DESCRIPTION rather than merged into
  // either: normalizer.ts only trusts its value when it actually looks
  // like a color word (this same header slot also turned up importer
  // names like "י.שלום" on other rows in the same column).
  | "VARIANT_TEXT"
  | "WARRANTY"
  | "IMAGE_URL"
  | "INTERNAL_COST"
  | "MANAGER_PRICE"
  | "MIN_SALE_PRICE"
  | "RETAIL_PRICE"
  | "CASH_PRICE"
  | "MARGIN_PERCENT"
  | "WAREHOUSE_STOCK"
  | "SHOWROOM_STOCK"
  | "SUPPLIER_STOCK"
  | "BONDED_STOCK"
  | "SELLABLE_STOCK"
  | "NOTES"
  | "IGNORED"
  | "UNKNOWN";

export type ClassifiedColumn = {
  index: number;
  label: string;
  field: ClassifiedField;
};

export type ParsedRow = {
  rowIndex: number; // 0-based row index within the sheet, for "view source"
  values: Partial<Record<ClassifiedField, (string | number)[]>>; // multiple columns can share a field (e.g. two showroom locations)
  raw: Record<string, string | number | null>; // header label -> value, full row for transparency
  sectionLabel: string | null; // text of the nearest preceding yellow-highlighted divider row, if any
  inheritedBrand: string | null; // last yellow-highlighted value seen in the BRAND column, forward-filled across rows where it's blank/untrusted
};

export type ParsedSheet = {
  sheetName: string;
  headerRowIndex: number;
  columns: ClassifiedColumn[];
  unknownLabels: string[];
  rows: ParsedRow[];
};

export type ParsedWorkbook = {
  sheets: ParsedSheet[];
  skippedSheets: string[];
};

// One raw stock column from the source, kept under its own original label
// rather than folded into a fixed bucket — "תצוגה חדרה" and "בונדד עומר"
// are different physical locations and the admin needs to see both, not a
// merged number. `field` is only used internally (total-stock math, status
// derivation); the label is what gets shown and persisted.
export type StockLine = {
  label: string;
  field: ClassifiedField;
  quantity: number;
};

export type NormalizedProductRow = {
  sourceKey: string;
  sheetName: string;
  rowIndex: number;
  categorySlug: string | null;

  sku: string; // real SKU; empty string when missing (skuIsSynthetic true — caller assigns a persistent temp SKU)
  skuIsSynthetic: boolean;
  model: string | null;
  brandName: string | null;
  title: string;
  color: string | null;
  warranty: string | null;
  imageUrl: string | null;

  retailPrice: number | null; // e.g. "מחיר מוצג" — a website-price candidate
  minSalePrice: number | null; // e.g. "מחיר מינימום" — a website-price candidate
  managerPrice: number | null; // e.g. "קוד מנכ"ל" — a website-price candidate
  internalCost: number | null; // e.g. "עלות ללא מעמ" — supplier cost, internal only, never a price candidate

  stockLines: StockLine[]; // every stock-classified column that had a numeric value for this row, zeros included

  rawSnapshot: Record<string, string | number | null>;

  issues: RowIssue[];
};

export type RowIssue = {
  type:
    | "MISSING_MODEL"
    | "INVALID_PRICE"
    | "NEGATIVE_STOCK"
    | "DUPLICATE_SKU"
    | "DUPLICATE_MODEL"
    | "UNMATCHED_ROW";
  message: string;
};
