/**
 * Our leaf categories, against Google's own product taxonomy.
 *
 * g:google_product_category was the one column genuinely missing from the
 * feed — of the four reported absent, shipping, product_type and
 * identifier_exists are all emitted on every row; only this one was not.
 *
 * EVERY ID HERE WAS READ OUT OF GOOGLE'S PUBLISHED TAXONOMY FILE
 * (taxonomy-with-ids.en-US.txt, version 2021-09-21), not recalled and not
 * guessed. That distinction is the whole reason this file has a comment:
 * a wrong category id is not a blank field, it is a confident claim that
 * a washing machine is something else, and Google acts on it. Anything
 * this map has no honest answer for is simply absent, and an absent
 * category lets Google classify the item itself — which it does well.
 *
 * Keyed by Category.slug, because that is stable and readable; a slug that
 * no longer exists is dead weight rather than a bug, and a new one that
 * is missing costs nothing until somebody adds it.
 */
export const GOOGLE_PRODUCT_CATEGORY: Record<string, number> = {
  // Kitchen — ovens and cooking
  "built-in-oven": 683, // Kitchen Appliances > Ovens
  "combi-oven": 683,
  "toaster-ovens": 761, // Toasters & Grills > Countertop & Toaster Ovens
  tabuns: 6278, // Toasters & Grills > Pizza Makers & Ovens
  "warming-drawers": 5103, // Kitchen Appliances > Food Warmers
  "gas-cooktops": 679, // Kitchen Appliances > Cooktops
  "induction-cooktops": 679,
  "ceramic-cooktops": 679,
  "hybrid-cooktops": 679,
  "hot-plates": 747, // Kitchen Appliances > Hot Plates
  microwaves: 753, // Kitchen Appliances > Microwave Ovens
  "range-hoods": 684, // Kitchen Appliances > Range Hoods
  "air-fryers": 738, // Kitchen Appliances > Deep Fryers

  // Kitchen — cold
  refrigeration: 686, // Kitchen Appliances > Refrigerators
  "fridge-4-door": 686,
  "fridge-bottom-freezer": 686,
  "fridge-top-freezer": 686,
  "fridge-side-by-side": 686,
  "fridge-integrated": 686,
  "fridge-3-door": 686,
  "mini-fridge": 686,
  "wine-fridge": 4539, // Kitchen Appliances > Wine Fridges
  freezers: 681, // Kitchen Appliances > Freezers

  // Kitchen — small appliances
  "food-processors": 505666, // Kitchen Appliances > Food Mixers & Blenders
  mixers: 505666,
  kettles: 751, // Kitchen Appliances > Electric Kettles
  juicers: 750, // Kitchen Appliances > Juicers
  "meat-grinders": 744, // Kitchen Appliances > Food Grinders & Mills
  "coffee-machines": 736, // Kitchen Appliances > Coffee Makers & Espresso Machines
  "coffee-grinders": 734, // Kitchen Appliance Accessories > ... > Coffee Grinders
  "milk-frothers": 3526, // Kitchen Appliances > Milk Frothers & Steamers
  "bread-makers": 732, // Kitchen Appliances > Breadmakers
  "small-kitchen-appliances": 730, // Kitchen & Dining > Kitchen Appliances
  "oven-kitchen-accessories": 2901, // Kitchen & Dining > Kitchen Appliance Accessories
  "dishwasher-standard": 680, // Kitchen Appliances > Dishwashers
  "dishwasher-fully-integrated": 680,
  "dishwasher-semi-integrated": 680,

  // Laundry
  "washing-machines": 2549, // Laundry Appliances > Washing Machines
  dryers: 2612, // Laundry Appliances > Dryers
  "washer-dryer-combo": 2849, // Laundry Appliances > Laundry Combo Units
  irons: 5139, // Laundry Appliances > Irons & Ironing Systems

  // Climate and floors
  "split-ac": 605, // Climate Control Appliances > Air Conditioners
  "portable-ac": 605,
  "central-ac": 605,
  heaters: 611, // Climate Control Appliances > Space Heaters
  radiators: 2060, // Climate Control Appliances > Heating Radiators
  fans: 608, // Climate Control Appliances > Fans
  "ceiling-fans": 1700, // Fans > Ceiling Fans
  "vacuum-cleaners": 619, // Household Appliances > Vacuums

  // Audio and video
  tvs: 404, // Electronics > Video > Televisions
  projectors: 396, // Electronics > Video > Projectors
  "projector-screens": 395, // Video Accessories > ... > Projection Screens
  "tv-mounts": 4458, // Video Accessories > ... > TV & Monitor Mounts
  speakers: 249, // Audio > Audio Components > Speakers
  "portable-speakers": 249,
  subwoofers: 249,
  headphones: 543626, // Audio Components > Headphones & Headsets > Headphones
  "receivers-amplifiers": 241, // Audio Components > Audio & Video Receivers
  soundbars: 249,
  cables: 1867, // Electronics Accessories > Cables > Audio & Video Cables

  // Personal care
  shavers: 532, // Shaving & Grooming > Electric Razors
  "hair-clippers": 533, // Shaving & Grooming > Hair Clippers & Trimmers
  "hair-dryers": 490, // Hair Styling Tools > Hair Dryers
  "hair-straighteners": 3407, // Hair Styling Tools > Hair Straighteners
  "hair-curlers": 489, // Hair Styling Tools > Curling Irons
  "personal-care": 2915, // Health & Beauty > Personal Care

  // Other
  "water-taps": 2032, // Hardware > Plumbing > Plumbing Fixtures > Faucets
};

/** The id for a product's category, or null when this map has no honest
    answer — in which case the column is omitted and Google classifies the
    item itself, which is the right outcome for a guess we would not make. */
export function googleProductCategoryFor(slug: string | null | undefined): number | null {
  if (!slug) return null;
  return GOOGLE_PRODUCT_CATEGORY[slug] ?? null;
}
