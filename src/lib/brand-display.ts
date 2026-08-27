// The supplier price sheets have no brand column for a good part of their
// rows, and the importer parks those under a literal "לא ידוע" brand record
// so the product still has something to hang off. That record is a filing
// convenience, not a manufacturer — but the storefront rendered it exactly
// like one, so a customer met "לא ידוע" as the brand line on the card, then
// "כל המוצרים של לא ידוע" and "אודות לא ידוע" on the product page, on an
// oven whose own description says it is an Electrolux.
//
// Backfilling the real manufacturer out of the enriched description (see
// scripts/backfill-brands.ts) recovers most of them. This is the guard for
// what is left: the storefront says nothing rather than saying "unknown".
const PLACEHOLDER_BRAND_NAMES = new Set(["לא ידוע", "לא ידועה", "ללא מותג", "unknown", "n/a", "-", "—"]);

export function isPlaceholderBrand(name: string | null | undefined): boolean {
  if (!name) return true;
  return PLACEHOLDER_BRAND_NAMES.has(name.trim().toLowerCase());
}

// Returns the brand name to print, or null when there is nothing worth
// printing — call sites drop the whole brand element on null rather than
// substituting filler text.
export function displayBrandName(name: string | null | undefined): string | null {
  return isPlaceholderBrand(name) ? null : (name as string).trim();
}
