/**
 * One reading of a product's specifications, for the three places that
 * state them.
 *
 * The product page draws its spec table from attribute values, the raw
 * spec JSON a source handed over, and the key/value lines in the
 * description. The Product JSON-LD and the Merchant Center feed used to
 * state none of it: every one of 1,656 product pages carried an empty
 * additionalProperty and a feed item with no product_detail, so a page
 * that visibly said "נפח: 25 ליטר" told Google nothing it could read as a
 * fact. The retailers that rank for a model number all do.
 *
 * All three now read these same rows, in this order, so the structured
 * data can never claim a spec the visible page does not show — which is
 * the rule Google checks a feed against the page by, and the rule that
 * keeps the JSON-LD honest.
 */

import { buildSpecRows, parseProductContent, splitDimensions, type SpecRow } from "@/lib/product-content";

export type SpecSource = {
  description: string | null;
  shortDescription: string | null;
  extraSpecsRaw: string | null;
  attributeValues: { value: string; attribute: { label: string; unit: string | null; sortOrder: number } }[];
};

export type ProductSpecs = {
  /** The main table, dimensions lifted out. */
  specs: SpecRow[];
  /** Height, width, depth, weight — their own block on the page. */
  dimensions: SpecRow[];
  /** Everything, in display order. */
  all: SpecRow[];
};

export function specRowsFor(product: SpecSource): ProductSpecs {
  const content = parseProductContent(product.description, product.shortDescription);
  const all = buildSpecRows(product.attributeValues, product.extraSpecsRaw, content.specs);
  const { specs, dimensions } = splitDimensions(all);
  return { specs, dimensions, all: [...specs, ...dimensions] };
}

export type StructuredSpec = { name: string; value: string };

/* Labels that name the product rather than describe it; they are already
   carried by their own fields (brand, mpn, sku) and would only repeat.
   Warranty and price are commercial terms, not properties of the machine —
   "אחריות: שנה + 4 ב-199 ש"ח" is an offer, and an offer has its own
   place in the markup. */
const NOT_A_SPEC = new Set([
  "מותג", "דגם", "מקט", "יצרן", "תוצרת", "קוד דגם", "ברקוד", "אחריות", "מחיר", "מחיר מומלץ",
  "משלוח", "זמן אספקה", "הערות", "הערה", "מידע נוסף", "קישור", "מקור",
]);

/* Values that say nothing. A row reading "לא צוין" is a row the source did
   not have; stating it as a property tells a crawler the product has an
   attribute whose value is "unspecified", which is worse than silence. */
const EMPTY_VALUES = new Set([
  "לא צוין", "לא צויין", "לא ידוע", "אין", "אין מידע", "אין נתון", "לא רלוונטי", "ללא",
  "-", "—", "–", "n/a", "na", "none", "null", "undefined", "tbd", "?",
]);

/* A price inside a spec value — "199 ש"ח", "₪1,990" — is a commercial term
   that wandered into the table. */
const LOOKS_LIKE_PRICE = /₪|ש"ח|ש״ח|שח\b|שקל|\bnis\b|\bils\b/i;

/** One spelling for a label, so "סל\"ד סחיטה" and "סל״ד סחיטה" are the same
    row rather than two rows with two values. Quotes of every kind are
    dropped (they only ever mark an abbreviation), whitespace collapsed,
    case folded for Latin. The display label keeps its first spelling. */
export function specKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/["'״׳`’‘]/g, "")
    .replace(/[\u0591-\u05C7]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/* Google's product_detail caps attribute names at 100 characters and
   values at 750; the schema.org side has no cap, but a "value" running to
   a paragraph is a description, not a property. */
const MAX_NAME = 100;
const MAX_VALUE = 200;
const MAX_ROWS = 40;

/** The rows as name/value pairs for schema.org additionalProperty and the
    feed's product_detail — the same list, so the two cannot disagree. */
export function structuredSpecs(rows: SpecRow[]): StructuredSpec[] {
  const out: StructuredSpec[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const name = row.label.trim();
    const value = row.value.trim();
    const key = specKey(name);
    if (!key || !value || seen.has(key)) continue;
    if (NOT_A_SPEC.has(key) || EMPTY_VALUES.has(value.toLowerCase()) || LOOKS_LIKE_PRICE.test(value)) continue;
    if (name.length > MAX_NAME || value.length > MAX_VALUE) continue;
    seen.add(key);
    out.push({ name, value });
    if (out.length >= MAX_ROWS) break;
  }
  return out;
}
