/**
 * The delivery policy, in a file with no server imports so the product page,
 * the cart drawer, the checkout, the Merchant Center feed and the product
 * page's structured data can all state the same numbers.
 *
 * They used to live only in pricing.ts, next to the database client, which
 * meant the one place a shopper was told what delivery costs was the cart
 * total after they had already decided. Unexpected costs at checkout are
 * the single largest reason people abandon a purchase, and the fix is not
 * clever: say the number where the decision is made.
 *
 * THE POLICY, as the shop runs it with צ'יטה:
 *
 *   ≥ ₪600   home delivery is free
 *   < ₪600   a pickup point is free; bringing it to the door costs ₪40
 *   always   collecting from the Hadera branch is free
 *
 * So the fee has exactly one cause: asking for the door on a basket under
 * the threshold. Every other combination is zero, which is why the function
 * below reads the way it does rather than as a table.
 */
export const FREE_DELIVERY_THRESHOLD = 600;

/** What it costs to upgrade from a pickup point to the door, under the
    threshold. Named for what it buys rather than "standard", because there
    are three standard methods now and two of them are free. */
export const HOME_DELIVERY_FEE = 40;

/**
 * How long a normal parcel takes, in business days — by where it is going.
 *
 * THE NUMBERS THE SHOP PUBLISHES, from 14 October 2026. The shop is in
 * Hadera and the carrier's own routes run the coastal strip, so an address
 * between Herzliya and Zichron Yaakov is reached inside three business
 * days; anywhere else in the country is three to seven. /shipping states
 * both as a promise, so every other place that quotes a delivery time has
 * to quote these and not its own figure — which is exactly what went wrong
 * before: the product card and the product page read Product.deliveryDays,
 * and that column is 7 on every row because 7 is its schema default and
 * nothing has ever written to it.
 *
 * The site does not know where a shopper is until the checkout, so the
 * figure a product page, a card, the feed and the structured data state is
 * the NATIONAL range — the worst case, the one every address is inside —
 * and the faster local promise is said next to it in words. Promising the
 * local figure to a shopper in Eilat is the kind of claim Merchant Center
 * reads as a misrepresented delivery estimate.
 *
 * Large items are the exception /shipping already names: a fridge goes by
 * carrier or straight from the importer, on its own terms, said on the
 * product page rather than here.
 */
export const DELIVERY_ZONES = {
  local: { label: "מהרצליה ועד זכרון יעקב", min: 1, max: 3 },
  national: { label: "שאר הארץ", min: 3, max: 7 },
} as const;

/** The published promise for any address: the national maximum. */
export const STANDARD_DELIVERY_DAYS: number = DELIVERY_ZONES.national.max;

/** The schema default of Product.deliveryDays. A row still carrying it has
    not been given a real answer, so it gets the shop's standard rather than
    a number nobody chose. The day the ERP starts filling that column, this
    starts deferring to it — which is why the check is against the default
    rather than the column being dropped. */
const DELIVERY_DAYS_UNSET = 7;

/** What to tell a shopper about this product, in business days — the
    latest it arrives anywhere in the country. */
export function deliveryDaysFor(product: { deliveryDays: number }): number {
  return product.deliveryDays === DELIVERY_DAYS_UNSET ? STANDARD_DELIVERY_DAYS : product.deliveryDays;
}

export type DeliveryPromise = { min: number; max: number };

/** The range a shopper is promised for this product, anywhere in the
    country. A product with its own figure from the ERP promises exactly
    that; everything else promises the national range. */
export function deliveryPromiseFor(product: { deliveryDays: number }): DeliveryPromise {
  if (product.deliveryDays === DELIVERY_DAYS_UNSET) {
    return { min: DELIVERY_ZONES.national.min, max: DELIVERY_ZONES.national.max };
  }
  return { min: product.deliveryDays, max: product.deliveryDays };
}

/** "3–7 ימי עסקים", or "עד 5 ימי עסקים" when the two ends meet. One
    spelling for the card, the buy block, the compare table and the tab, so
    they cannot drift apart by a word. */
export function deliveryPromiseText(product: { deliveryDays: number }): string {
  const { min, max } = deliveryPromiseFor(product);
  return min === max ? `עד ${max} ימי עסקים` : `${min}–${max} ימי עסקים`;
}

/** The faster promise for the coastal strip, said beside the national
    one wherever there is room for a second clause. */
export const LOCAL_DELIVERY_NOTE = `עד ${DELIVERY_ZONES.local.max} ימי עסקים ${DELIVERY_ZONES.local.label}`;

/**
 * Large-item carriage: what is included and what costs extra, from the
 * owner's terms (14 October 2026). Stated on /shipping and in §12 of the
 * terms; check:terms holds the two to the same figures.
 */
/** Carried up to this floor at no extra charge. */
export const FLOORS_INCLUDED = 3;
/** Per floor above that, when the item cannot go up in the lift. */
export const EXTRA_FLOOR_FEE = 50;
/** A fridge whose doors have to come off to get it in — the carrier's
    tariff decides where in the range. */
export const DOOR_REMOVAL_FEE = { min: 120, max: 250 } as const;

/**
 * The same promise, split the way ShippingDeliveryTime wants it.
 *
 * handlingTime and transitTime are counted in BUSINESS days, not calendar
 * days — Google states it outright ("the minimum and maximum number of
 * business days for handling and transit of an order"), and schema.org
 * carries a `businessDays` property on ShippingDeliveryTime for declaring
 * which days those are. An earlier version assumed the calendar and padded
 * the figure by a weekend, which published a promise two days slower than
 * the one the shop makes.
 *
 * Google adds the two maximums, so they have to sum to the promise and not
 * to more; the two minimums likewise sum to the earliest the shop says.
 * Both are the NATIONAL range, because the feed and the structured data
 * address one country and cannot say "faster near Hadera". Derived from
 * DELIVERY_ZONES rather than typed as literals, because a second copy of
 * the number is how the page and the structured data came to disagree in
 * the first place.
 *
 * The split: up to a day to pick, pack and hand over, the rest with the
 * carrier. An order placed in the morning can go out the same day
 * (handling 0), so transit carries the whole minimum.
 */
export const HANDLING_DAYS = { min: 0, max: 1 } as const;

export const TRANSIT_DAYS = {
  min: DELIVERY_ZONES.national.min - HANDLING_DAYS.min,
  max: DELIVERY_ZONES.national.max - HANDLING_DAYS.max,
} as const;

/**
 * Which days those are. Sunday to Thursday is the working week here, and
 * saying so removes the last ambiguity: a crawler never has to guess
 * whether the shop counts Friday.
 */
export const BUSINESS_DAY_NAMES = [
  "https://schema.org/Sunday",
  "https://schema.org/Monday",
  "https://schema.org/Tuesday",
  "https://schema.org/Wednesday",
  "https://schema.org/Thursday",
] as const;

/* The carrier is deliberately not named anywhere a shopper reads — not on
   the checkout, not on /shipping. The owner's reason (14 October): the
   shop may ship another way, and a name printed in six places is six
   promises to keep. "חברת המשלוחים" says what matters without saying who. */

/**
 * DELIVERY      to the address the customer gives
 * PICKUP_POINT  to one of the carrier's collection points
 * PICKUP        from the shop's own counter in Hadera
 *
 * PICKUP_POINT sits between the two on purpose: it is the free option for a
 * small basket, and it is the one most shoppers under the threshold should
 * be choosing.
 */
export type DeliveryMethod = "DELIVERY" | "PICKUP_POINT" | "PICKUP";

/**
 * What delivery costs — and nothing costs delivery when there is none.
 *
 * The method used to be missing from this calculation entirely, so an order
 * collected from the counter in Hadera was charged to deliver it there. The
 * checkout showed the charge and the order carried it, consistently and
 * wrongly, which is the kind of error nobody reports as a bug: the customer
 * assumes it is the shop's policy and either pays it or leaves.
 *
 * Defaulted to DELIVERY so the callers that genuinely do not know the method
 * yet — the cart drawer, where nobody has chosen; the feed, where Google is
 * being told the worst case — keep quoting the number a shopper should plan
 * for. Choosing a pickup point or the branch is what removes it.
 */
export function computeDeliveryFee(subtotal: number, method: DeliveryMethod = "DELIVERY") {
  // Both collection methods are free at every basket size.
  if (method !== "DELIVERY") return 0;
  return subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : HOME_DELIVERY_FEE;
}

/**
 * Whether this method needs a street address.
 *
 * A pickup point does, which is the part that surprises people: the carrier
 * arranges the point with the customer afterwards, and it needs to know
 * where they are to offer one near them. Only collecting from our own
 * counter needs no address, because the address is ours.
 */
export function requiresAddress(method: DeliveryMethod): boolean {
  return method !== "PICKUP";
}
