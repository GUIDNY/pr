// Department/subcategory structure derived from a live audit of prec.co.il's
// mega menu (fetched & parsed directly from its HTML — see project notes).
// Regrouped into cleaner top-level departments for the new IA; every leaf
// category name below is real content from the source site.

export type CategoryNode = {
  name: string;
  slug: string;
  icon: string; // lucide-react icon name
  children: { name: string; slug: string }[];
};

/* Every category slug in the database belongs here. The category route
   resolves a slug against this list (findCategoryBySlug) while the sitemap
   is built from the database, so a slug present there and absent here is a
   URL the sitemap offers and the site answers 404 to — which is what
   happened to ten categories, six of them with products on the shelf. */
export const CATEGORY_TREE: CategoryNode[] = [
  {
    name: "טלוויזיות ומולטימדיה",
    slug: "tv-multimedia",
    icon: "Tv",
    children: [
      { name: "מסכי טלוויזיה", slug: "tvs" },
      { name: "מקרנים", slug: "projectors" },
      { name: "מסכים למקרנים", slug: "projector-screens" },
      { name: "מתקני תליה", slug: "tv-mounts" },
      { name: "שולחנות טלוויזיה ומעמדים", slug: "tv-stands" },
    ],
  },
  {
    name: "סטריאו וקולנוע ביתי",
    slug: "audio-home-theater",
    icon: "Speaker",
    children: [
      { name: "מקרני קול", slug: "soundbars" },
      { name: "רמקולים", slug: "speakers" },
      { name: "רמקולים ניידים ובידורית", slug: "portable-speakers" },
      { name: "סאב וופרים", slug: "subwoofers" },
      { name: "רסיברים ומגברים", slug: "receivers-amplifiers" },
      { name: "אוזניות", slug: "headphones" },
      { name: "נגני בלוריי, DVD וסטרימרים", slug: "bluray-streamers" },
      { name: "חיווט וכבלים", slug: "cables" },
      { name: "אביזרי AV ומפצלים", slug: "av-accessories" },
      { name: "מיקרופונים ומערכות אלחוטיות", slug: "microphones" },
      { name: "מתקנים לרמקולים", slug: "speaker-mounts" },
    ],
  },
  {
    name: "מקררים וקירור",
    slug: "refrigeration",
    icon: "Refrigerator",
    children: [
      { name: "מקרר מקפיא עליון", slug: "fridge-top-freezer" },
      { name: "מקרר מקפיא תחתון", slug: "fridge-bottom-freezer" },
      { name: 'מקרר SBS דלת לצד דלת', slug: "fridge-side-by-side" },
      { name: "מקרר 3 דלתות", slug: "fridge-3-door" },
      // Five-door fridges live here too rather than in a leaf of their own —
      // they are the same French-door body with one more split, five of them
      // in the catalog, and a category holding five products is a dead end on
      // a menu. The slug stays fridge-4-door because it is public in the URL.
      { name: "מקרר 4-5 דלתות", slug: "fridge-4-door" },
      { name: "מקררים ומקפיאים אינטגרליים", slug: "fridge-integrated" },
      { name: "מקרר יינות", slug: "wine-fridge" },
      { name: "מקרר משרדי", slug: "mini-fridge" },
      { name: "מקפיאים", slug: "freezers" },
    ],
  },
  /* Dishwashers used to be a department of their own, beside this one.
     Both were thin: the mega menu lists only sub-categories that have live
     products (see getNavigableCategoryTree), and of the six leaves across
     the two, three have no products at all — so the menu was really showing
     "כביסה וייבוש" with two entries and "מדיחי כלים" with one. Two thin
     columns beside each other read as a shop with no range; one column of
     three reads as a section.

     Merged into this one rather than into the kitchen, because what these
     share is the plumbing: a washing machine, a dryer and a dishwasher are
     the three machines in a home that take a water inlet and a drain, and
     they are shopped for, delivered and installed the same way.

     The slug stays `laundry` — it is public in /category/laundry and in
     the sitemap. /category/dishwashers is 301'd to it in next.config.ts;
     that address is indexed and linked from the dishwasher buying guide,
     so it cannot simply stop existing. */
  {
    name: "כביסה, ייבוש ומדיחים",
    slug: "laundry",
    icon: "WashingMachine",
    children: [
      { name: "מכונות כביסה", slug: "washing-machines" },
      { name: "מייבשי כביסה", slug: "dryers" },
      { name: "מכונת כביסה משולבת מייבש", slug: "washer-dryer-combo" },
      { name: "מדיח כלים", slug: "dishwasher-standard" },
      { name: "מדיח כלים חצי אינטגרלי", slug: "dishwasher-semi-integrated" },
      { name: "מדיח כלים אינטגרלי מלא", slug: "dishwasher-fully-integrated" },
    ],
  },
  {
    name: "תנורים וכיריים",
    slug: "ovens-cooktops",
    icon: "Flame",
    children: [
      { name: "תנור בנוי", slug: "built-in-oven" },
      { name: "תנור משולב", slug: "combi-oven" },
      { name: "כיריים גז", slug: "gas-cooktops" },
      { name: "כיריים קרמיות", slug: "ceramic-cooktops" },
      { name: "כיריים אינדוקציה", slug: "induction-cooktops" },
      { name: "כיריים משולבות גז ואינדוקציה", slug: "hybrid-cooktops" },
      { name: "קולטי אדים", slug: "range-hoods" },
      { name: "מגירות חימום", slug: "warming-drawers" },
      { name: "אביזרים לתנורים ולמטבח", slug: "oven-kitchen-accessories" },
    ],
  },
  {
    name: "מוצרי חשמל למטבח",
    slug: "small-kitchen-appliances",
    icon: "Coffee",
    children: [
      { name: "מיקרוגלים", slug: "microwaves" },
      { name: "טוסטר אובן", slug: "toaster-ovens" },
      { name: "טוסטר לחיצה", slug: "sandwich-toasters" },
      { name: "טוסטר קופץ ומצנם", slug: "pop-up-toasters" },
      { name: "קומקומים ומיחמים", slug: "kettles" },
      { name: "כירה ופלטה חשמלית", slug: "hot-plates" },
      { name: "סירי טיגון ובישול", slug: "air-fryers" },
      { name: "אופה לחם ונפת קמח", slug: "bread-makers" },
      { name: "מסחטות מיץ", slug: "juicers" },
      { name: "מיקסרים", slug: "mixers" },
      { name: "מטחנת בשר", slug: "meat-grinders" },
      { name: "מעבדי מזון וקוצצים", slug: "food-processors" },
      { name: "בלנדרים", slug: "blenders" },
      { name: "מכונות אספרסו וקפה", slug: "coffee-machines" },
      { name: "מקציף חלב", slug: "milk-frothers" },
      { name: "מטחנות קפה ותבלינים", slug: "coffee-grinders" },
    ],
  },
  {
    name: "מוצרי חשמל לבית",
    slug: "home-appliances",
    icon: "Sparkles",
    children: [
      { name: "שואבי אבק ומכונות שטיפה", slug: "vacuum-cleaners" },
      { name: "מגהצים", slug: "irons" },
      { name: "קטלי יתושים", slug: "mosquito-killers" },
      { name: "בר מים", slug: "water-dispensers" },
      // Filed under בר מים in the database (a third level this tree does
      // not have); listed here so their pages resolve. The בר מים page
      // still shows them — a category page lists its children's products.
      { name: "ברזי מים", slug: "water-taps" },
      { name: "טאבונים", slug: "tabuns" },
      { name: "מנגלים ומטבחי חוץ", slug: "grills" },
      { name: "תאורה חכמה פיליפס Hue", slug: "smart-lighting" },
      // A top-level category in the database with one product. A department
      // of its own in the menu would be a department of one; as a child
      // here its page exists and the menu hides it until it has stock.
      { name: "אביזרים לרכב", slug: "car-accessories" },
    ],
  },
  {
    name: "מיזוג אוויר",
    slug: "air-conditioning",
    icon: "Wind",
    children: [
      { name: "מזגן עילי", slug: "split-ac" },
      { name: "מזגן מיני מרכזי", slug: "central-ac" },
      { name: "מזגן נייד", slug: "portable-ac" },
    ],
  },
  {
    name: "חימום ואוורור",
    slug: "heating-ventilation",
    icon: "Thermometer",
    children: [
      { name: "רדיאטורים", slug: "radiators" },
      { name: "תנורי חימום", slug: "heaters" },
      { name: "מפזרי חום", slug: "heat-fans" },
      { name: "סדין חימום", slug: "heating-blankets" },
      { name: "מאווררים", slug: "fans" },
      { name: "מאווררי תקרה", slug: "ceiling-fans" },
    ],
  },
  {
    name: "מחשבים ותקשורת",
    slug: "computers-communication",
    icon: "Laptop",
    children: [
      { name: "טאבלטים", slug: "tablets" },
      { name: "קונסולות משחקים", slug: "gaming-consoles" },
      { name: "טלפונים אלחוטיים", slug: "cordless-phones" },
      { name: "טלפונים שולחניים", slug: "landline-phones" },
      { name: "מערכות מצלמות אבטחה", slug: "security-cameras" },
    ],
  },
  {
    name: "טיפוח אישי",
    slug: "personal-care",
    icon: "Scissors",
    children: [
      { name: "מכונות גילוח", slug: "shavers" },
      { name: "מכונות תספורת", slug: "hair-clippers" },
      { name: "מסיר שיער", slug: "epilators" },
      { name: "מחליק שיער", slug: "hair-straighteners" },
      { name: "מייבש שיער", slug: "hair-dryers" },
      { name: "מסלסל שיער", slug: "hair-curlers" },
    ],
  },
];

export function findCategoryBySlug(slug: string) {
  for (const dept of CATEGORY_TREE) {
    if (dept.slug === slug) return { department: dept, sub: null };
    const sub = dept.children.find((c) => c.slug === slug);
    if (sub) return { department: dept, sub };
  }
  return null;
}

export const ALL_LEAF_SLUGS = CATEGORY_TREE.flatMap((d) => d.children.map((c) => c.slug));
