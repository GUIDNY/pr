import { categoryForSheet, subCategoryFromSectionLabel, type SourceKey } from "./sheet-map";
import { extractBrand, extractBrandFromDivider, isPlausibleBrandCell } from "./brand-extractor";
import type { ClassifiedColumn, NormalizedProductRow, ParsedRow, RowIssue, StockLine } from "./types";

function isMappedSourceKey(key: string): key is SourceKey {
  return key === "electronics" || key === "small-appliances" || key === "white-goods-screens";
}

function firstNumber(values?: (string | number)[]): number | null {
  if (!values || values.length === 0) return null;
  const n = Number(values[0]);
  return Number.isFinite(n) ? n : null;
}

function firstString(values?: (string | number)[]): string | null {
  if (!values || values.length === 0) return null;
  const v = String(values[0]).trim();
  return v || null;
}

// A sheet can spread one product's text across more than one column — the
// classifier maps them all to DESCRIPTION and the parser collects them in
// order, so taking values[0] silently dropped everything after the first.
// That is what cut titles off right before "דגם ...": the model number lives
// in the second half. Join instead, skipping blanks and any fragment already
// contained in what came before (the same text repeated across two columns is
// common enough to be worth not doubling).
function joinStrings(values?: (string | number)[]): string | null {
  if (!values || values.length === 0) return null;
  const parts: string[] = [];
  for (const v of values) {
    const s = String(v).trim();
    if (!s) continue;
    if (parts.some((p) => p.includes(s))) continue;
    parts.push(s);
  }
  return parts.join(" ").trim() || null;
}

// The sheets that carry a model number almost always write it inline as
// "... דגם SHE3705/00" rather than in a column of its own, so a product with
// no MODEL column still has its model — just buried in prose. Without it
// pulled out there is nothing to look the product up by on the
// manufacturer's site, which is the single thing that blocks enrichment.
//
// Deliberately conservative: it stops at the first run of model-ish
// characters, so trailing Hebrew words ("דגם X בצבע שחור") don't get swept
// in. A wrong model number is worse than none — it sends whoever is
// enriching to a different product entirely.
const MODEL_AFTER_KEYWORD = /דגם\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9\/.\-+]{1,22})/;

function modelFromDescription(description: string | null): string | null {
  if (!description) return null;
  const match = description.match(MODEL_AFTER_KEYWORD);
  if (!match) return null;
  const candidate = match[1].replace(/[.\-\/+]+$/, "").trim();
  // A bare number is almost always a size or a quantity that happened to
  // follow the word, not a model designation.
  if (!/[A-Za-z]/.test(candidate) && candidate.length < 4) return null;
  return candidate || null;
}

// Real values seen in the wild in a bare "תאור" column (see VARIANT_TEXT):
// "שחור", "זכוכית", "ורוד", "י.שלום", "שחור מט", "תכלת", ... — genuine
// colors mixed with importer-name leftovers in the very same column.
// Only accept a value that actually looks like a color; anything else
// (an importer name, a stray note) is silently dropped rather than
// mislabeled as a color.
const COLOR_WORD_PATTERN =
  /שחור|לבן|אפור|כסוף|כסף|זהב|זהוב|אדום|כחול|תכלת|ירוק|צהוב|כתום|ורוד|רוז|סגול|חום|בז['"]?|נירוסטה|זכוכית|בורדו|שמפניה/;

function firstColorLike(values?: (string | number)[]): string | null {
  if (!values) return null;
  for (const v of values) {
    const s = String(v).trim();
    if (s && COLOR_WORD_PATTERN.test(s)) return s;
  }
  return null;
}

const STOCK_FIELDS: readonly string[] = [
  "WAREHOUSE_STOCK",
  "SHOWROOM_STOCK",
  "SUPPLIER_STOCK",
  "BONDED_STOCK",
  "SELLABLE_STOCK",
];

// One line per distinct raw column label classified as a stock field —
// this is the whole point of the per-source model: "תצוגה חדרה" and "בונדד
// עומר" stay separate, never summed into one bucket. `row.values` already
// dropped non-numeric cells (e.g. "במלאי" with no number) during parsing,
// so what's left here is exactly the confirmed numeric quantities — nothing
// is invented for a column that only had text.
function buildStockLines(row: ParsedRow, columns: ClassifiedColumn[]): StockLine[] {
  const lines: StockLine[] = [];
  const seenLabels = new Set<string>();
  for (const col of columns) {
    if (!STOCK_FIELDS.includes(col.field)) continue;
    if (seenLabels.has(col.label)) continue;
    seenLabels.add(col.label);
    const raw = row.raw[col.label];
    if (raw === null || raw === undefined || raw === "") continue;
    const n = typeof raw === "number" ? raw : Number(String(raw).trim().replace(/[₪,%\s]/g, ""));
    if (!Number.isFinite(n)) continue; // non-numeric stock text — preserved in rawSnapshot, never turned into a quantity
    lines.push({ label: col.label, field: col.field, quantity: n });
  }
  return lines;
}

// Real product titles never look like "84X190X65.5" or "218X125X6.4" — a
// dimensions triplet/pair with an x/X/× separator. classifier.ts now routes
// a "מידות" *header* to IGNORED so it can't even reach this function, but
// some sheets label that column something else entirely (or leave it
// unlabeled) — this catches the dimensions-shaped *value* regardless of
// what its header said, so it's never mistaken for the longest/most
// title-like unknown cell. Matches the acceptance check for this fix:
// no product title should match this same shape.
const DIMENSIONS_LIKE = /^[\d.]+\s*[xX×]\s*[\d.]+/;

// Some sheets give the description column an idiosyncratic header instead
// of a recognizable one — e.g. "מוצרי DAVO" ("DAVO's products") rather than
// "תאור מוצר". No fixed keyword list can anticipate every brand's naming.
// When there's no classified DESCRIPTION/MODEL, the longest unclassified
// (UNKNOWN) text cell in the row is very likely the product name — a
// short SKU or note is never going to out-length an actual title.
function fallbackTitleFromUnknownColumns(row: ParsedRow, columns: ClassifiedColumn[]): string | null {
  let best: string | null = null;
  for (const col of columns) {
    if (col.field !== "UNKNOWN") continue;
    const raw = row.raw[col.label];
    if (raw === null || raw === undefined) continue;
    const s = String(raw).trim();
    if (DIMENSIONS_LIKE.test(s)) continue;
    if (s.length >= 8 && (!best || s.length > best.length)) best = s;
  }
  return best;
}

export function normalizeRow(
  sourceKey: string,
  sheetName: string,
  row: ParsedRow,
  columns: ClassifiedColumn[],
  categoryOverride?: string | null,
  knownBrands: string[] = []
): NormalizedProductRow {
  const issues: RowIssue[] = [];

  const realSku = firstString(row.values.SKU);
  const description = joinStrings(row.values.DESCRIPTION) ?? fallbackTitleFromUnknownColumns(row, columns);
  // A dedicated דגם column is the most trustworthy source and wins; the
  // sheets that lack one still name the model inline in the description.
  const model = firstString(row.values.MODEL) ?? modelFromDescription(description);
  const color = firstString(row.values.COLOR) ?? firstColorLike(row.values.VARIANT_TEXT);
  const warranty = firstString(row.values.WARRANTY);
  const imageUrlRaw = firstString(row.values.IMAGE_URL);
  const imageUrl = imageUrlRaw && /^https?:\/\//i.test(imageUrlRaw) ? imageUrlRaw : null;

  // Brand resolution, most-trusted first:
  //  1. This row's own BRAND cell, when the value is believable at all
  //     (isPlausibleBrandCell rejects promo codes and stray numbers). The
  //     row naming its own manufacturer beats anything inherited: the
  //     inherited value comes from an unknown distance up the sheet, and
  //     letting it win here is what filed Bauknecht fridges under AEG.
  //  2. inheritedBrand — the brand block this row sits in, forward-filled
  //     by the parser for rows that leave the column blank.
  //  3. Picking the manufacturer out of the description text itself.
  //  4. The section divider this row sits under — see brand-extractor.ts.
  const ownBrand = firstString(row.values.BRAND);
  const brandName =
    (ownBrand && isPlausibleBrandCell(ownBrand) ? ownBrand.trim() : null) ??
    row.inheritedBrand ??
    (description ? extractBrand(description, knownBrands) : null) ??
    extractBrandFromDivider(row.sectionLabel);

  // The full description is the richest text available and should win as
  // the title whenever it exists — brandName+model is only a fallback for
  // sheets that have neither a description column nor a fallback-detected
  // one (rare, but happens on lookup/reference-style tabs).
  const title = description || [brandName, model].filter(Boolean).join(" ") || `${sheetName} #${row.rowIndex}`;

  if (!model && !description) {
    issues.push({ type: "MISSING_MODEL", message: "אין דגם או תיאור מזהה לשורה זו" });
  }

  // No real SKU: leave sku empty and let the caller (sync.ts) resolve it —
  // either reusing an already-assigned persistent temp SKU for this same
  // logical product, or minting the next sequential one. That decision
  // needs DB access (an atomic counter, a lookup for the existing product),
  // which this pure function deliberately doesn't have.
  const skuIsSynthetic = !realSku;
  const sku = realSku ?? "";

  // Every non-cost price-like column is a website-price candidate — see
  // diff-engine.ts's resolvedPrice(), which takes the lowest of these.
  // Some sheets have all three, some have one; internalCost is kept
  // strictly separate (it's the supplier's cost, never a candidate).
  const retailPrice = firstNumber(row.values.RETAIL_PRICE); // e.g. "מחיר מוצג"
  const minSalePrice = firstNumber(row.values.MIN_SALE_PRICE); // e.g. "מחיר מינימום" / "מינימום למכירה"
  const managerPrice = firstNumber(row.values.MANAGER_PRICE); // e.g. "קוד מנכ״ל"
  const internalCost = firstNumber(row.values.INTERNAL_COST); // e.g. "עלות ללא מעמ" — supplier cost, admin-only

  const lowestPrice = [retailPrice, minSalePrice, managerPrice].filter((p): p is number => p !== null);
  if (lowestPrice.some((p) => p <= 0)) {
    issues.push({ type: "INVALID_PRICE", message: `מחיר לא תקין: ${lowestPrice.find((p) => p <= 0)}` });
  }

  const stockLines = buildStockLines(row, columns);
  for (const line of stockLines) {
    if (line.quantity < 0) {
      issues.push({ type: "NEGATIVE_STOCK", message: `מלאי שלילי (${line.label}): ${line.quantity}` });
    }
  }

  return {
    sourceKey,
    sheetName,
    rowIndex: row.rowIndex,
    // Row-level detection (the yellow section divider this row sits under)
    // wins when it matches a known sub-category — it's more specific than
    // the sheet-wide default. `categoryOverride` here is that sheet-wide
    // default as resolved by the caller (an admin's explicit source-level
    // override for Excel sources, or the tab's own category for Google
    // Sheets) — the fallback when no sub-category rule matches this row.
    categorySlug:
      subCategoryFromSectionLabel(row.sectionLabel) ??
      categoryOverride ??
      (isMappedSourceKey(sourceKey) ? categoryForSheet(sourceKey, sheetName) : null),
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
    managerPrice,
    internalCost,
    stockLines,
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
