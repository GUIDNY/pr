import { db } from "@/lib/db";

/**
 * A fixed amount added to the price-list price for every product of a brand.
 *
 * Frigidaire, the owner's words on 8 November: "תמיד מחירון + 200 — שיהיה
 * ככה פשוט במוצרים האלה". Always the price list plus 200, so when the
 * supplier moves a price the site moves with it and stays 200 above. That
 * replaced the freeze of 1 November, which held the prices of that day and
 * would have ignored the supplier's next change in either direction.
 *
 * Applied where the sync resolves a row's price (inventory/sync.ts), so it
 * covers a new product's first price and every later adoption alike, and a
 * product with priceManualAt set — a person's price — is still left alone.
 * The cost floor is checked on the price list's own number, before this is
 * added, so the markup can never be what carries a price over cost.
 *
 * Keyed by the brand's name as the Brand table holds it, and resolved to
 * ids once per process: the name is what a person reads in the back
 * office, the id is what a product carries.
 */
export const BRAND_PRICE_MARKUP: Readonly<Record<string, number>> = {
  "פריגידר": 200,
};

let byId: Promise<Map<string, number>> | null = null;

function markupsById(): Promise<Map<string, number>> {
  byId ??= db.brand
    .findMany({ where: { name: { in: Object.keys(BRAND_PRICE_MARKUP) } }, select: { id: true, name: true } })
    .then((rows) => new Map(rows.map((b) => [b.id, BRAND_PRICE_MARKUP[b.name] ?? 0])))
    .catch((err) => {
      byId = null; // try again next time rather than pricing a whole run without it
      throw err;
    });
  return byId;
}

/** The amount to add to this brand's price-list price, 0 for every other brand. */
export async function brandPriceMarkup(brandId: string | null | undefined): Promise<number> {
  if (!brandId) return 0;
  return (await markupsById()).get(brandId) ?? 0;
}

/** The price list's price with the brand's markup on it; null stays null. */
export function withMarkup(sheetPrice: number | null, markup: number): number | null {
  return sheetPrice === null ? null : sheetPrice + markup;
}
