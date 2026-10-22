/**
 * A price no appliance can really carry.
 *
 * On 22 October the owner found a Sauter grinder attachment on the site at
 * 1 ₪, four in stock. Its row in the price list holds the single number 1,
 * the sync adopted it as the price before the strict floor existed, and a
 * batch of priceManualAt flags on 13 October then froze it there, so the
 * floor the sync has since grown could never reach it. The storefront's
 * own rule was `price > 0`, which 1 passes.
 *
 * "A product that costs a shekel is hidden at once" — the owner's words.
 * So the storefront asks for a floor, not just a number, and the watchdog
 * sweeps for anything the floor or the cost says cannot be right. Both
 * read from here so they cannot disagree.
 *
 * No imports: the checks run it without a database.
 */

/** The least a product may show for. The cheapest live product is an
    emergency lamp at 30 ₪; nothing the shop sells is a single-digit
    price, and a number under this is a cell that was never a price. */
export const MIN_PUBLIC_PRICE = 10;

export type UnderpricedReason = "below_floor" | "at_or_below_cost";

/** Why a price must not be shown, or null when it may. The cost rule is
    strict — a candidate equal to the cost is the cost (see resolvedPrice)
    — and only applies when a cost is known. */
export function underpricedReason(price: number, supplierCost: number | null | undefined): UnderpricedReason | null {
  if (!(price >= MIN_PUBLIC_PRICE)) return "below_floor";
  if (typeof supplierCost === "number" && supplierCost > 0 && price <= supplierCost) return "at_or_below_cost";
  return null;
}

export const UNDERPRICED_LABELS: Record<UnderpricedReason, string> = {
  below_floor: `מחיר נמוך מ-${MIN_PUBLIC_PRICE} ₪ — זה לא מחיר, זה תא ריק או שגוי במחירון`,
  at_or_below_cost: "מחיר שווה לעלות הספק או נמוך ממנה",
};
