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
 * The price lists that sell only what is actually on a shelf.
 *
 * The owner, 25 October, about מחירון מלאי אלקטרוניקה and that workbook
 * alone: "מעכשיו מעלים רק מה שבמלאי — זה אומר שנמצא במחסנים, שיש מספר."
 * It narrows his own rule of 19 October, and only for this one sheet: the
 * other two go on being sold without stock, because for those there is a
 * supplier to ring. For electronics there is not.
 *
 * What it costs, measured the day it was asked for: 245 of these products
 * were live, 65 of them with a number in a stock column and 180 without.
 * So 180 products — ₪459,892 of listed price — come off the site, and that
 * is the whole point rather than a side effect.
 *
 * Nothing is deleted, unpublished or re-imported. This is a query-time gate
 * like the four beside it in PUBLIC_PRODUCT_WHERE, so the day a unit arrives
 * in a warehouse the product is back on the site at the next page load, with
 * nobody having to remember it.
 *
 * A key here rather than a flag on InventorySource, deliberately: it is a
 * policy about a supplier, it belongs beside the rule it bends, and it
 * cannot silently fail to write. If it ever has to be switchable per sheet
 * without a deploy, that is when it becomes a column.
 *
 * `stockQty` is what "has a number" means, and it is the sum of every stock
 * column on the row — מלאי, מלאי חדרה and תצוגה. A display unit therefore
 * counts: 10 of the 65 survivors are display-only, and the sheets themselves
 * say "למכור מלאי ותצוגה". If the owner means warehouses and not the
 * showroom, this is the sentence to come back to.
 */
const STOCK_ONLY_SOURCES = new Set(["electronics", "small-appliances"]);

/**
 * Which stock columns count as stock we can actually sell.
 *
 * מחירון ליין קטן carries nine of them. Four are warehouses — "מלאי חדרה",
 * "טובים חדרה", "מלאי LUXRY", "טובים" — and five are display units
 * ("תצוגה חדרה", "תצוגות LUXERY", "תצוגת לקצ'ורי", …), plus a "יתרה"
 * running total over the lot. Summing them, which is what totalStock does
 * everywhere else, answers "does this exist somewhere in the company" —
 * a different question from "can this shop sell it".
 *
 * The owner's instruction on 1 November was the narrow one, twice over:
 * "רק מה שיש לו מספר במלאי חדרה". Not the Hedera branch broadly — that
 * column. A display unit in Hedera does not count and neither does a
 * LUXERY warehouse, which is a location this shop does not ship from.
 *
 * Measured before it was written: of the 653 live products in that
 * workbook, 298 have a number in that column and 355 do not, ₪374,598 of
 * listed value, 130 of them holding stock that is real but somewhere
 * else.
 *
 * Listed per source and not globally, because the other two workbooks
 * were never asked about and their columns are not the same ones. A
 * source absent from here keeps summing every column, which is the
 * behaviour everything else in this file was built against.
 *
 * This pairs with STOCK_ONLY_SOURCES above and only works paired: counting
 * fewer columns changes nothing on its own, because a product at zero is
 * still sold to order unless its workbook is also stock-only. That is why
 * small-appliances joins electronics in the same change.
 */
const SELLABLE_STOCK_COLUMNS: Record<string, readonly string[]> = {
  "small-appliances": ["מלאי חדרה"],
};

/**
 * The stock columns that count for this source, or null to count them all.
 *
 * Labels are compared trimmed: the sheets carry "מלאי חדרה " with a
 * trailing space in some tabs and not others, and a rule that depended on
 * which would be a rule nobody could keep.
 */
export function sellableStockColumnsFor(
  sourceKey: string | null | undefined,
): readonly string[] | null {
  if (!sourceKey) return null;
  return SELLABLE_STOCK_COLUMNS[sourceKey] ?? null;
}

/** Does this stock line count towards what we can sell? */
export function stockLineCounts(
  label: string,
  columns: readonly string[] | null,
): boolean {
  if (!columns) return true;
  const want = label.trim();
  return columns.some((c) => c.trim() === want);
}

/**
 * May this product be sold when no warehouse holds a unit?
 *
 * The single place that encodes the owner's rule. `PUBLIC_PRODUCT_WHERE` and
 * the cart's add handler both ask it, so there is one answer rather than two
 * that drift.
 *
 * Two inputs, because there are now two ways to be stock-only: the price
 * list marked this row as gone, or the whole price list is one we do not
 * order from. `sourceKey` is required rather than optional on purpose — an
 * optional one would read as ORDERABLE wherever somebody forgot it, which is
 * the permissive direction and the silent one.
 */
/**
 * Brands sold whether or not any stock column has a number — and whatever the
 * row says about availability.
 *
 * Ninja, the owner on 8 November: "מוצרי נינג'ה גם אם יש במלאי וגם אם אין —
 * שתמיד יופיע באתר". Ninja is the one brand the shop prices by hand and
 * sources directly, so the price list's stock columns say nothing about
 * whether one can be had. It overrides STOCK_ONLY_SOURCES, which is what
 * hid 22 of them: מחירון ליין קטן counts only "מלאי חדרה", and Ninja is
 * rarely there.
 *
 * Compared case-insensitively against Brand.name ("NINJA" in the table).
 * Written once here and read by the three places the rule lives —
 * PUBLIC_PRODUCT_WHERE, isSellableNow and the sync's deriveStockStatus — so
 * the listing, the product page and the card's buy button cannot disagree.
 */
export const ALWAYS_SELLABLE_BRANDS: readonly string[] = ["NINJA"];

export function brandAlwaysSellable(brandName: string | null | undefined): boolean {
  return !!brandName && ALWAYS_SELLABLE_BRANDS.includes(brandName.trim().toUpperCase());
}

export function sellableWithoutStock(
  availability: SourceAvailability,
  sourceKey: string | null | undefined,
  brandName?: string | null,
): boolean {
  if (brandAlwaysSellable(brandName)) return true;
  if (sourceKey && STOCK_ONLY_SOURCES.has(sourceKey)) return false;
  return availability === "ORDERABLE";
}

/** For the back office and the guards: is this sheet sold from stock only? */
export function sourceSellsFromStockOnly(sourceKey: string | null | undefined): boolean {
  return !!sourceKey && STOCK_ONLY_SOURCES.has(sourceKey);
}

/** The keys, for the one guard that asserts both copies of the gate agree. */
export const STOCK_ONLY_SOURCE_KEYS: readonly string[] = [...STOCK_ONLY_SOURCES];

/**
 * Can this product be sold right now?
 *
 * The runtime twin of the `AND` clause in PUBLIC_PRODUCT_WHERE, for the places
 * that hold a product in hand rather than a Prisma filter: the product page's
 * own sold-out state, the sitemap, the back office's "why is this not live"
 * lists. A Prisma where-object cannot call a function, so the rule is
 * necessarily written twice — and writing it twice is exactly how a rule like
 * this rots, so both copies name `sourceAvailability` and check:sheet-facts
 * asserts that they do.
 *
 * `product-page-view.tsx` is why this exists. It derived its own sold-out
 * state from `stockQty <= 0`, which would have shown all 1,163 products the
 * new rule admits as out of stock, with no buy button, on a page the listings
 * had just started linking to.
 *
 * A null availability reads as ORDERABLE, matching the column's default: a
 * product created by the admin form has never been near a price list and
 * nothing has said it cannot be got.
 */
export function isSellableNow(p: {
  stockQty: number;
  sourceAvailability?: string | null;
  /* Required, not optional — see sellableWithoutStock. Null is right for a
     product that came from no price list at all. */
  sourceKey: string | null | undefined;
  /* For ALWAYS_SELLABLE_BRANDS. Optional so a caller without the brand in
     hand still compiles — but it then answers as though the product were
     any other brand, so every caller that can should pass it. */
  brand?: { name: string } | null;
}): boolean {
  if (p.stockQty > 0) return true;
  return sellableWithoutStock((p.sourceAvailability ?? "ORDERABLE") as SourceAvailability, p.sourceKey, p.brand?.name);
}

/* For the back office only. The customer is told nothing about where the unit
   comes from — the owner was explicit: we take the payment and talk to the
   supplier, as though the warehouse had it. */
export function availabilityNoteForAdmin(a: SourceAvailability, stock: number): string | null {
  if (a === "ORDERABLE") return stock > 0 ? null : "אין מלאי — יימשך מהספק";
  if (stock > 0) return `${SOURCE_AVAILABILITY_LABELS[a]} — נמכר עד גמר המלאי`;
  return `${SOURCE_AVAILABILITY_LABELS[a]} — לא ניתן למכירה`;
}
