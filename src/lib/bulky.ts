/**
 * Which products are too big for a collection point.
 *
 * צ'יטה's pickup points are shop counters and lockers. A courier can leave a
 * microwave or a pair of headphones at one; a fridge, a washing machine or a
 * 75-inch television cannot go there at all. Collecting from our own counter
 * in Hadera is a different matter — that is a shop with a loading area and
 * staff, and everything can be collected there.
 *
 * So: bulky products lose the pickup-point option and keep the other two.
 *
 * WHICH WAY TO GUESS. The two mistakes are not equal, and the rule below is
 * deliberately lopsided because of it. Calling a light product bulky costs a
 * customer a free option they could have used — an annoyance, and one they
 * can phone about. Calling a heavy one light lets somebody order a fridge to
 * a collection point, which the carrier cannot fulfil: the order has to be
 * unwound by hand, somebody makes an apologetic phone call, and the customer
 * has already told their family it is arriving Thursday. When a category is
 * genuinely mixed, it is listed as bulky.
 *
 * WHY NOT WEIGHT. Product.weight exists as a spec and is filled on nine
 * products out of two thousand. A rule that reads it would be right nine
 * times and silently wrong the rest, which is worse than a rule that is
 * openly approximate. If the ERP ever fills that column this file is where
 * the real number would go, and the categories become the fallback.
 *
 * Categories rather than a per-product flag for the same reason the blocked
 * image hosts are a list: it is a decision somebody makes once, out loud, in
 * a file that shows up in a diff — not a boolean on two thousand rows that
 * nobody audits and the sync can overwrite.
 */

/**
 * Departments where everything is bulky. Whole-department rather than
 * leaf-by-leaf because there is no fridge, no washing machine and no air
 * conditioner that fits in a locker, and a new leaf added under one of these
 * tomorrow should inherit the answer rather than default to "light".
 */
const BULKY_DEPARTMENTS = new Set([
  "refrigeration", // fridges and freezers, down to the office one
  "laundry", // washing machines, dryers, dishwashers
  "ovens-cooktops", // built-in ovens, cooktops, extractor hoods
  "air-conditioning", // split, central and even the portable units
]);

/**
 * Bulky leaves inside departments that are otherwise light.
 *
 * Each of these sits next to something genuinely small — a television beside
 * a pair of headphones, a water dispenser beside an iron — so the department
 * cannot be judged as a whole.
 */
const BULKY_CATEGORIES = new Set([
  // Televisions and multimedia
  "tvs", // a 65-inch panel is not a parcel
  "tv-stands", // furniture
  "projector-screens", // long, rigid, and awkward at any size

  // Audio. The named leaves are floor-standing or cabinet-sized; the small
  // speakers, soundbars and headphones the shop also sells stay light.
  "subwoofers",
  "speakers", // includes floorstanders, and the listing does not separate them

  // Home
  "water-dispensers", // ברי מים — floor-standing, plumbed
  "vacuum-cleaners", // upright and wash-and-vac units, not handhelds

  // Heating and ventilation
  "radiators",
  "ceiling-fans", // blade span, not weight
]);

/**
 * Whether a product cannot be sent to a collection point.
 *
 * Takes the leaf category and its parent department, both by slug, because
 * that is what a product carries and what the tree is keyed by. A product
 * parked directly on a department — which happens, the sheet maps a whole
 * tab to one broad category — is judged by that department alone.
 */
export function isBulkyCategory(categorySlug: string | null, parentSlug: string | null): boolean {
  if (parentSlug && BULKY_DEPARTMENTS.has(parentSlug)) return true;
  if (categorySlug && BULKY_DEPARTMENTS.has(categorySlug)) return true;
  return categorySlug !== null && BULKY_CATEGORIES.has(categorySlug);
}

/** True when anything in the basket cannot go to a collection point. One
    bulky line decides for the whole order: the carrier delivers the order,
    not the line. */
export function cartHasBulky(items: { isBulky: boolean }[]): boolean {
  return items.some((i) => i.isBulky);
}
