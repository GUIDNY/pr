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
//
// Names are stored canonically — trimmed, inner runs of whitespace collapsed
// — and matched through normaliseSheetName() below, so a tab the supplier
// types as "מסכים " and a tab they type as "מסכים" are the same tab.
//
// They did not used to be. These keys were transcribed from the workbooks
// with the supplier's stray spaces intact and matched exactly, which made a
// space load-bearing; when normalizer.ts began trimming the incoming name
// the two sides stopped agreeing and four tabs silently stopped importing
// for 35 days. check:sheets now fails if a key is added that carries
// whitespace a lookup would have to forgive.
export const SHEET_CATEGORY_MAP: Record<SourceKey, Record<string, string>> = {
  electronics: {
    "מקרנים+DVD+סטרימר סמארט +ממירים": "projectors",
    "רמקולים בידוריות ואוזניות": "speakers",
    "רסיברים ומערכות סטריאו": "receivers-amplifiers",
    "מתקניי תליה וכבלים": "tv-mounts",
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
    "מכונות קפה + מטחנות קפה": "coffee-machines",
    "מוצרי חורף": "heaters",
  },
  "white-goods-screens": {
    כיריים: "gas-cooktops",
    "מסכים": "tvs",
    "מ. כביסה": "washing-machines",
    מייבשים: "dryers",
    מדיחים: "dishwasher-standard",
    "ת.בנוי": "built-in-oven",
    "ת. משולב": "combi-oven",
    מקררים: "refrigeration",
    "מקפיאים": "freezers",
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

/**
 * A tab name with its whitespace taken out of the comparison.
 *
 * This function exists because of a 35-day outage, and the shape of it is
 * worth keeping in mind before touching anything here.
 *
 * The keys in the maps above were transcribed from the real workbooks on
 * 2026-08-17, faithfully — including the stray spaces the supplier typed:
 * "מסכים ", "מקפיאים ", "מכונות קפה + מטחנות קפה ", " מתקניי תליה וכבלים".
 * Faithful is the right way to transcribe a source. The lookup was then an
 * exact string match, which made the stray space load-bearing.
 *
 * On 2026-09-09 normalizer.ts started trimming the incoming tab name —
 * correctly, to stop a supplier's retyped space being read as a renamed tab
 * and duplicating every SKU-less row under it. From that moment the two
 * sides disagreed: a trimmed "מסכים" never matched the key "מסכים ", the
 * lookup returned null, and sync.ts dropped every row in those four tabs
 * before touching a product. The sheets were read every day. The rows were
 * parsed every day. 123 live products worth ₪538,000 went 35 days without a
 * stock or availability update, and a customer rang about a TV mount that
 * had left the price list in September.
 *
 * So: whitespace is not part of a tab's name, on either side, ever. Both the
 * stored keys and the incoming name go through here, and
 * scripts/check-sheet-map.ts fails the build if a key is ever added that
 * would depend on it — because a normaliser nobody can see is one trim away
 * from being bypassed again.
 */
export function normaliseSheetName(name: string): string {
  return String(name ?? "").trim().replace(/\s+/g, " ");
}

/* Built once at module load from the literals above, so the literals stay a
   faithful transcription of the workbook and every lookup is still
   whitespace-insensitive. */
const NORMALISED_SHEET_CATEGORY_MAP: Record<SourceKey, Record<string, string>> = Object.fromEntries(
  Object.entries(SHEET_CATEGORY_MAP).map(([sourceKey, map]) => [
    sourceKey,
    Object.fromEntries(Object.entries(map).map(([name, slug]) => [normaliseSheetName(name), slug])),
  ]),
) as Record<SourceKey, Record<string, string>>;

export function categoryForSheet(sourceKey: SourceKey, sheetName: string): string | null {
  const scoped = NORMALISED_SHEET_CATEGORY_MAP[sourceKey]?.[normaliseSheetName(sheetName)];
  if (scoped) return scoped;
  /* A tab we know from somewhere else. The supplier has written the mount
     tab both as " מתקניי תליה וכבלים" and as "מוצרי תלייה וכבלים" —
     different words, not different whitespace, so no normaliser unifies
     them — and 187 products sat under the second name alone. Falling back
     to the unscoped table means any tab name this project has ever seen
     resolves, whichever workbook it arrives in.
     Safe because no tab name maps to two different categories across the
     three sources; check:sheets asserts exactly that, so this fallback
     cannot start guessing the day someone adds a colliding name. */
  return categoryForUnscopedSheet(sheetName);
}

export function isProductSheet(sourceKey: SourceKey, sheetName: string): boolean {
  const name = normaliseSheetName(sheetName);
  return !(NON_PRODUCT_SHEETS[sourceKey] ?? []).some((s) => normaliseSheetName(s) === name);
}

/** Every tab name the project knows, for check:sheets and for reporting a
    tab that matched none of them. */
export function allKnownSheetNames(): { source: string; name: string; slug: string }[] {
  const out: { source: string; name: string; slug: string }[] = [];
  for (const [sourceKey, map] of Object.entries(SHEET_CATEGORY_MAP)) {
    for (const [name, slug] of Object.entries(map)) out.push({ source: sourceKey, name, slug });
  }
  for (const [name, slug] of Object.entries(EXTRA_TAB_CATEGORY_MAP)) {
    out.push({ source: "extra-tab", name, slug });
  }
  return out;
}

// Google Sheets tab names seen so far that don't exactly match an Excel
// sheet name (different wording/spacing for the same category) — the
// spreadsheets appear to be live replacements for individual Excel tabs.
export const EXTRA_TAB_CATEGORY_MAP: Record<string, string> = {
  "גריל מערכות גז מים": "water-dispensers",
  "מוצרי תלייה וכבלים": "tv-mounts",
};

// Best-effort category lookup for a spreadsheet tab with no known source
// key (a standalone Google Sheet, not one of the three fixed Excel
// workbooks) — tries an exact match against every known sheet name across
// all sources first, then a small set of known naming variants, then null
// (surfaced to the admin as needing a manual category, never guessed).
export function categoryForUnscopedSheet(sheetName: string): string | null {
  const wanted = normaliseSheetName(sheetName);
  for (const map of Object.values(SHEET_CATEGORY_MAP)) {
    for (const [name, slug] of Object.entries(map)) {
      if (normaliseSheetName(name) === wanted) return slug;
    }
  }
  /* Normalised here too. This table is the one with the whitespace-bearing
     Google Sheets variants in it ("גריל מערכות גז מים "), and an exact
     match on those is the same trap one table over. */
  for (const [name, slug] of Object.entries(EXTRA_TAB_CATEGORY_MAP)) {
    if (normaliseSheetName(name) === wanted) return slug;
  }
  return null;
}

// A tab's yellow section dividers ("אוזניות", "מנגלים ומטבחי חוץ...",
// "טאבונים") often describe a real sub-category, more specific than the
// whole tab's default. Keyword-matched (like classifier.ts) rather than
// exact-string, since the same real divider shows up with different exact
// wording sheet to sheet. Order matters: first match wins. A miss falls
// back to the sheet-level category — never blocks the row.
type SubCategoryRule = { test: (label: string) => boolean; slug: string };

const SUB_CATEGORY_RULES: SubCategoryRule[] = [
  { test: (l) => /אוזני/.test(l), slug: "headphones" },
  { test: (l) => /רמקולים ניידים|בידור|קריוק/.test(l), slug: "portable-speakers" },
  { test: (l) => /מנגל|מטבח חוץ/.test(l), slug: "grills" },
  { test: (l) => /טאבו/.test(l), slug: "tabuns" },
  { test: (l) => /ברז|בר מים/.test(l), slug: "water-taps" },
];

export function subCategoryFromSectionLabel(label: string | null): string | null {
  if (!label) return null;
  for (const rule of SUB_CATEGORY_RULES) {
    if (rule.test(label)) return rule.slug;
  }
  return null;
}
