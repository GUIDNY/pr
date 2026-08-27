import { displayBrandName } from "@/lib/brand-display";

// Supplier price sheets have no "product name" column. The importer builds a
// title out of the sheet's description cell (see inventory/normalizer.ts),
// which is whatever the supplier's own buyer typed into their spreadsheet —
// and what they typed is the line item as *they* file it, not as a customer
// would ever ask for it. Straight from the live catalog:
//
//   "GOOGLE TV"                      (a television — no size, no brand)
//   "UHD LED 4K"                     (nine different televisions share it)
//   "חיישנים+קונדנסור+אפשרות ניקוז"   (a tumble dryer, named by its features)
//   "דיגיטלי 25 ליטר"                 (a microwave)
//   "124-70-2.6"                     (a screen mount, named by its carton)
//
// Every one of those is a spec fragment. The brand, the category and the
// model number all exist on the same product row — they were simply never
// part of the string. Composing them back into the title is what turns a
// shelf of unnameable fragments into a shelf of products, using only fields
// already on the record.
//
// Deliberately a *display* derivation rather than a rewrite of Product.title:
// title belongs to the sync and the enrichment/admin path (see the field
// ownership table in CLAUDE.md), so writing it here would mean two owners
// for one column and a nightly job that undoes this by morning. Reading it
// at render time also means a real title, once someone curates one, simply
// wins with nothing to unwind.

// The noun a product of each category goes by in its own name. An explicit
// table rather than a plural-stripping heuristic, because the real category
// names are compounds and coordinations that no morphological rule survives:
// "מקררים וקירור" would come out "מקרר וקירור", and "שואבי אבק ומכונות
// שטיפה" worse still.
//
// Categories that name two different kinds of product are left out on
// purpose — "קומקומים ומיחמים" holds both kettles and urns, and calling an
// urn a קומקום in its own title is a wrong fact about the product, which is
// the one thing worse than a vague one. Anything absent here contributes no
// prefix and the title is composed from brand and model alone.
const CATEGORY_NOUNS: Record<string, string> = {
  "מסכי טלוויזיה": "טלוויזיה",
  "כיריים גז": "כיריים גז",
  "תנור בנוי": "תנור בנוי",
  "תנור משולב": "תנור משולב",
  "תנורי חימום": "תנור חימום",
  "מכונות כביסה": "מכונת כביסה",
  "מייבשי כביסה": "מייבש כביסה",
  "מדיח כלים": "מדיח כלים",
  "מיקרוגלים": "מיקרוגל",
  "מקפיאים": "מקפיא",
  "מגהצים": "מגהץ",
  "מאווררים": "מאוורר",
  "מקרנים": "מקרן",
  "רמקולים": "רמקול",
  "אוזניות": "אוזניות",
  "טוסטר אובן": "טוסטר אובן",
  "טאבונים": "טאבון",
  "קולטי אדים": "קולט אדים",
  "ברזי מים": "ברז מים",
  "מזגן עילי": "מזגן עילי",
  "מתקני תליה": "מתקן תליה",
};

// The same manufacturer is written in Hebrew in one column and in Latin in
// another, and the two spellings sit on different sides of the same product:
// Brand.name is "Bosch" while the sheet's own title says "בוש", "SMEG"
// against "סמג", "Eco Euro" against "סמיקום". Without knowing they are the
// same company, composing a title stutters the brand twice in two alphabets
// ("טוסטר אובן Bosch בוש טוסטר לחיצה..."). Only aliases that actually occur
// in this catalog are listed; an unlisted brand simply falls back to
// comparing the two strings directly.
const BRAND_ALIASES: string[][] = [
  ["bosch", "בוש"],
  ["smeg", "סמג", "סמאג"],
  ["electrolux", "אלקטרולוקס"],
  ["aeg", "אאג"],
  ["samsung", "סמסונג"],
  ["sony", "סוני"],
  ["siemens", "סימנס"],
  ["sharp", "שארפ"],
  ["gorenje", "גורניה", "גורנייה"],
  ["hisense", "הייסנס"],
  ["delonghi", "דלונגי"],
  ["sauter", "סאוטר", "סאווטר"],
  ["faber", "פאבר"],
  ["hyundai", "יונדאי"],
  ["eco euro", "ecoeuro", "אקו יורו", "סמיקום", "סמקום"],
  ["klipsch", "קליפש"],
  ["onkyo", "אונקיו"],
  ["remington", "רמינגטון", "רימנגטון"],
  ["blomberg", "בלומברג"],
  ["midea", "מידאה"],
  ["zanussi", "זנוסי"],
  ["haier", "האייר", "הייר"],
  ["liebherr", "ליבהר"],
  ["beko", "בקו"],
  ["miele", "מילה"],
  ["candy", "קנדי"],
  ["philips", "פיליפס", "פילפס"],
  ["braun", "בראון"],
  ["kenwood", "קנווד"],
  ["tefal", "טפאל", "טאפל"],
];

function brandSpellings(brand: string): string[] {
  const key = brand.trim().toLowerCase();
  const group = BRAND_ALIASES.find((names) => names.includes(key));
  return group ?? [key];
}

function titleNamesBrand(base: string, brand: string): boolean {
  const haystack = base.toLowerCase();
  return brandSpellings(brand).some((name) => haystack.includes(name));
}

// A title that is nothing but digits and separators — "124-70-2.6",
// "190-108-6" — is the carton's dimensions, copied into the description
// column by a warehouse. It tells a customer nothing at all about the
// product, so it is dropped rather than carried into the name alongside the
// brand and model that do.
const CARTON_DIMENSIONS = /^[\d.\-x×*\s]+$/;

// Supplier bookkeeping that ended up in the description column and has no
// meaning to a customer. Removed rather than carried into the name.
// Anchored with \s rather than \b: JavaScript's \b is ASCII-only, so it
// finds no boundary at the end of a Hebrew word and the pattern never
// matches.
const NON_DESCRIPTIVE_FRAGMENTS = [/^מוצר מועדף\s*/];

// Strips the punctuation and spacing that differ between how a model number
// is printed in a title and how it's stored ("EOH 6212K" vs "EOH6212K"), so
// the two can be compared for "does this title already name the model".
function modelKey(value: string): string {
  return value.replace(/[\s\-_.]/g, "").toLowerCase();
}

// Two adjacent cells in the source sheet often repeat each other's tail,
// which lands in the title verbatim: "פירוליטי 72 ליטר טיימר דיגיטלי טיימר
// דיגיטלי". Collapse any run of words immediately repeated by an identical
// run. Longest runs first, so "a b a b" collapses to "a b" rather than
// leaving "a b b" behind.
export function collapseRepeatedPhrases(title: string): string {
  const words = title.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  for (let size = Math.floor(words.length / 2); size >= 1; size--) {
    for (let i = 0; i + size * 2 <= words.length; i++) {
      const first = words.slice(i, i + size);
      const second = words.slice(i + size, i + size * 2);
      // A repeated number is usually two real measurements ("60 60" could be
      // a genuine pair) — only collapse a run that carries an actual word.
      if (!first.some((w) => /\p{L}{2,}/u.test(w))) continue;
      if (first.every((w, k) => w.toLowerCase() === second[k].toLowerCase())) {
        words.splice(i + size, size);
        return collapseRepeatedPhrases(words.join(" "));
      }
    }
  }
  return words.join(" ");
}

export function buildDisplayTitle({
  title,
  brandName,
  categoryName,
  model,
}: {
  title: string;
  brandName?: string | null;
  categoryName?: string | null;
  model?: string | null;
}): string {
  let base = collapseRepeatedPhrases(title ?? "");
  for (const pattern of NON_DESCRIPTIVE_FRAGMENTS) base = base.replace(pattern, "").trim();

  if (CARTON_DIMENSIONS.test(base)) base = "";

  const brand = displayBrandName(brandName);
  const noun = categoryName ? CATEGORY_NOUNS[categoryName] : undefined;

  // Each part is added only when the title doesn't already carry it, so a
  // title someone has curated properly ("בוש קומקום חשמלי דגם TWK7L460")
  // passes through untouched while a fragment gets the missing halves.
  const parts = [
    noun && !base.includes(noun) ? noun : null,
    brand && !titleNamesBrand(base, brand) ? brand : null,
    base || null,
    model && !modelKey(base).includes(modelKey(model)) ? `דגם ${model}` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" ") : base;
}
