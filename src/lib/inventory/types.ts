export type ClassifiedField =
  | "SKU"
  | "MODEL"
  | "BRAND"
  | "DESCRIPTION"
  | "COLOR"
  | "WARRANTY"
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

export type NormalizedProductRow = {
  sourceKey: string;
  sheetName: string;
  rowIndex: number;
  categorySlug: string | null;

  sku: string; // real SKU, or a deterministic synthetic one when missing
  skuIsSynthetic: boolean;
  model: string | null;
  brandName: string | null;
  title: string;
  color: string | null;
  warranty: string | null;

  retailPrice: number | null;
  minSalePrice: number | null;
  internalCost: number | null;

  sellableStock: number | null;
  warehouseStock: number | null;
  showroomStock: number | null;
  supplierStock: number | null;
  bondedStock: number | null;

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
