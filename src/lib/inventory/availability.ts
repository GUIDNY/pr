import type { SourceAvailability } from "@/lib/enums";
import { SOURCE_AVAILABILITY_LABELS } from "@/lib/enums";

/**
 * What the price list says about whether a product can still be got.
 *
 * The owner's rule, 19 October, and it inverts the store's default: **almost
 * everything in the price list can be sold.** If no warehouse has it, someone
 * rings the supplier and the supplier delivers to the customer. A product with
 * no stock number is therefore an ordinary product — same page, same button,
 * same checkout — not a "special order" with a badge and a promised date.
 *
 * The one exception is a row the owner has marked as gone. For those, and only
 * those, stock on hand is the limit: sellable while a warehouse or a showroom
 * still has a unit, and not sellable past that, because there is nothing left
 * to order from the supplier.
 *
 * So this module answers one question — *can this row be sold without stock?* —
 * and `stockQty` answers the other. Neither replaces the other:
 * `PUBLIC_PRODUCT_WHERE` needs both.
 *
 * ## Where the marker lives
 *
 * Nowhere in particular. Measured across the three workbooks, 187 rows carry
 * one, spread over six different columns: `הערות +מבצע חג`, `הערות+מבצע`,
 * `הערות+מבצעים`, `המלצה`, `דגם`/`מס דגם` and `תאור מוצר`. There is no single
 * cell to read, so every text value on the row is scanned.
 *
 * ## The boundary matters, and here is the row that proves it
 *
 * "סוף דגם" cannot be matched as a plain substring. `מקרנים` row 16 reads
 * **"ברז דיגיטלי טאצ' שחור כסוף דגם TOUCH"** — a tap, in stock, perfectly
 * sellable, whose colour is *כסוף* ("silver") and whose next word is *דגם*.
 * A substring test reads "כסוף דגם" as "end of model" and takes the row off
 * the site. Both markers are therefore anchored so a Hebrew letter may not
 * precede them.
 */

/* The values and their Hebrew labels live in enums.ts, which CLAUDE.md makes
   the single source of truth for every enum-like column — this module reads
   them off a row and decides what they mean, it does not define them. */
export type { SourceAvailability } from "@/lib/enums";
export { SOURCE_AVAILABILITY_LABELS } from "@/lib/enums";

/* `(?<![א-ת])` is the whole defence against "כסוף דגם". Node has supported
   lookbehind since 8.3; the build targets far newer. */
const END_OF_LINE = /(?<![א-ת])סוף\s*דגם|(?<![א-ת])הופסק|ירד\s*מהמדף/;
const TEMPORARY = /(?<![א-ת])אזל[^א-ת]{0,3}\s*זמנית|זמנית[^א-ת]{0,3}\s*אזל/;
const GONE = /(?<![א-ת])אזל(?![א-ת])|אין\s*(?:ב)?מלאי/;

/**
 * Read the row's availability out of every text cell it has.
 *
 * `values` is the row's raw snapshot — header label to cell value, exactly as
 * `ParsedRow.raw` holds it. Numbers are skipped: a marker is always words.
 */
export function sourceAvailability(values: Record<string, string | number | null>): SourceAvailability {
  let gone = false;
  let temporary = false;
  for (const v of Object.values(values)) {
    if (typeof v !== "string" || !v) continue;
    /* End of line is the strongest statement — the model is not coming back —
       so it wins outright over "אזל" on the same row ("אזל סוף דגם", 14 rows). */
    if (END_OF_LINE.test(v)) return "END_OF_LINE";
    if (TEMPORARY.test(v)) temporary = true;
    else if (GONE.test(v)) gone = true;
  }
  if (temporary) return "TEMPORARILY_OUT";
  if (gone) return "STOCK_ONLY";
  return "ORDERABLE";
}

/**
 * May this product be sold when no warehouse holds a unit?
 *
 * The single place that encodes the owner's rule. `PUBLIC_PRODUCT_WHERE` and
 * the cart's add handler both ask it, so there is one answer rather than two
 * that drift.
 */
export function sellableWithoutStock(availability: SourceAvailability): boolean {
  return availability === "ORDERABLE";
}

/* For the back office only. The customer is told nothing about where the unit
   comes from — the owner was explicit: we take the payment and talk to the
   supplier, as though the warehouse had it. */
export function availabilityNoteForAdmin(a: SourceAvailability, stock: number): string | null {
  if (a === "ORDERABLE") return stock > 0 ? null : "אין מלאי — יימשך מהספק";
  if (stock > 0) return `${SOURCE_AVAILABILITY_LABELS[a]} — נמכר עד גמר המלאי`;
  return `${SOURCE_AVAILABILITY_LABELS[a]} — לא ניתן למכירה`;
}
