import type { ImportChannel } from "@/lib/enums";

/**
 * Official importer or parallel importer, read off the price list.
 *
 * The owner's rule, 19 October: a parallel-import unit may be listed and sold
 * like any other, **as long as the page says so**, and its warranty is twelve
 * months from the importer unless the sheet states something else — in which
 * case the sheet wins.
 *
 * ## The marker is inside the brand cell, which is why the brands broke
 *
 * There is a column headed `י.שלום` on two tabs (`מקררים`, `מ. כביסה`) and it
 * is empty on every row. The real marker is written into the manufacturer's own
 * cell: `"גורניה י.שלום"`, `"LG י.שלום"`, `"ASKO י שלום"`, `"גורנייה שלום"`, or
 * just `"י שלום"` with no manufacturer at all. On eleven rows that cell went
 * through brand resolution unchanged, so the catalogue now holds seven Brand
 * rows that are an importer's name rather than a manufacturer's:
 *
 *     "י.שלום" · "י שלום" · "י. שלום" · "גורניה י.שלום"
 *     "גורניה  י.שלום" · "LG י.שלום" · "ASKO י שלום"
 *
 * An ASKO fridge at ₪7,200 and a Samsung at ₪6,500 are filed under them. The
 * fix is not to correct those rows — the next sync re-derives the same answer —
 * it is to split the cell before the brand is resolved, which is what this does.
 *
 * On a further 22 rows (Smeg kettles and toasters) the marker sits in a notes
 * or variant column instead, and the brand came out correct. Those rows need
 * the channel without touching their brand, so the two cases are separate
 * functions.
 *
 * ## "תשלום" is not "שלום"
 *
 * The sheets say `"התקנה מול הספק בתשלום נפרד"`, `"1+4 תשלום ביקור"` and
 * `"תשלום בבית למתקין"` — 15 cells where *payment* contains the importer's
 * name as a substring. Every pattern here is anchored so a Hebrew letter may
 * not precede `שלום`, which rejects all of them.
 */

/* The values and their labels live in enums.ts — the single source of truth
   for every enum-like column. */
export type { ImportChannel } from "@/lib/enums";
export { IMPORT_CHANNEL_LABELS } from "@/lib/enums";

/** What the page prints. The owner asked for it to be stated plainly. */
export const PARALLEL_IMPORT_NOTICE = "יבוא מקביל";

/* The one parallel importer the price list names. A list rather than a
   constant because the shape of the problem is "which importer", not "is it
   Y. Shalom" — but only values seen in the real workbooks belong here. */
const PARALLEL_IMPORTERS = [{ canonical: "י. שלום", pattern: /(?<![א-ת])י\s*\.?\s*שלום(?![א-ת])/ }];

/* In a brand cell the importer's name also turns up without its initial —
   `"גורנייה שלום"`. Accepted there and nowhere else: a bare "שלום" in free
   text is too weak to act on. */
const BARE_IN_BRAND = /(?<![א-ת])שלום(?![א-ת])/;

export type BrandSplit = {
  /** The manufacturer, with the importer's name taken out. Null when the cell
   *  named only the importer — the row's brand then has to come from the
   *  ordinary chain (block header, description, divider). */
  brand: string | null;
  /** The importer, canonically spelled, or null. */
  importer: string | null;
  channel: ImportChannel;
};

/**
 * Split a BRAND/`חברה`/`מותג` cell into manufacturer and importer.
 *
 * Runs before brand resolution, so `"גורניה י.שלום"` resolves to the existing
 * Gorenje brand instead of minting a new one.
 */
export function splitImporterFromBrand(cell: string | null | undefined): BrandSplit {
  const raw = (cell ?? "").trim();
  if (!raw) return { brand: null, importer: null, channel: "OFFICIAL" };

  for (const imp of PARALLEL_IMPORTERS) {
    if (imp.pattern.test(raw)) {
      const rest = raw.replace(imp.pattern, " ").replace(/\s+/g, " ").trim();
      return { brand: rest || null, importer: imp.canonical, channel: "PARALLEL" };
    }
  }
  if (BARE_IN_BRAND.test(raw)) {
    const rest = raw.replace(BARE_IN_BRAND, " ").replace(/\s+/g, " ").trim();
    /* A cell that is only "שלום" names the importer. A cell that is
       "גורנייה שלום" names both, and the remainder is the manufacturer. */
    return { brand: rest || null, importer: "י. שלום", channel: "PARALLEL" };
  }
  return { brand: raw, importer: null, channel: "OFFICIAL" };
}

/**
 * The channel for a whole row, for the rows that carry the marker somewhere
 * other than the brand cell — a notes or variant column, as the 22 Smeg rows
 * do. Stricter than the brand-cell test: the initial is required, because free
 * text is where "תשלום" and a greeting would otherwise reach.
 */
export function rowImportChannel(values: Record<string, string | number | null>): {
  importer: string | null;
  channel: ImportChannel;
} {
  for (const v of Object.values(values)) {
    if (typeof v !== "string" || !v) continue;
    for (const imp of PARALLEL_IMPORTERS) {
      if (imp.pattern.test(v)) return { importer: imp.canonical, channel: "PARALLEL" };
    }
  }
  return { importer: null, channel: "OFFICIAL" };
}

/**
 * Months of warranty on a parallel-import unit when the sheet did not say.
 *
 * Twelve, by the owner's instruction on 19 October, honoured by the importer
 * rather than the manufacturer. A value in the sheet's warranty column
 * overrides it — that was the explicit condition — so this is only consulted
 * once `parseWarranty` has come back unrecognised.
 */
export const PARALLEL_IMPORT_DEFAULT_WARRANTY_MONTHS = 12;

/* The sentence a parallel-import page prints when the sheet gave no warranty
   of its own. It names the importer because that is who honours it, and it
   says nothing the sheet did not support. */
export function parallelImportWarrantySentence(importer: string | null): string {
  const who = importer ?? "היבואן";
  return `אחריות שנה באחריות ${who} (יבוא מקביל).`;
}
