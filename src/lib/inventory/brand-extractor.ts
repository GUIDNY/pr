// Manufacturer names show up three different ways across real source
// sheets: a dedicated column, a yellow section-divider row that groups
// several products under one brand, or embedded directly in the free-text
// description with no consistent delimiter. This layers a few heuristics,
// most-confident first, and returns null rather than guessing when nothing
// matches — an unknown brand stays unknown, it never gets invented.

// Confirmed missing three of these the hard way: a real sync run read the
// within-sheet section dividers "מצנמים" (toasters), "מיקסרים" (mixers) and
// "אינדוקציה" (induction) as brand names for 68 products, because none of
// them matched here — isBrandLike had no signal telling it those are
// category labels, not manufacturer names. Added those plus their
// singular/related forms (טוסטר, משקל, מעבד, בלנדר, קוצץ — same failure
// mode, spotted while fixing the first three) so the same class of bug
// doesn't quietly corrupt the next new category a future sheet introduces.
const PRODUCT_TYPE_WORDS =
  /(רמקולים|רמקול|אוזניות|מגברים|מגבר|סאבוופר|סאבופר|סאב|וופר|מקרן|מקרני|בידורית|בידוריות|מערכת|מערכות|כיסוי|כיסויים|כבל|כבלים|מתקן|מתקנים|סטנד|שולחן|שולחנות|קופסא|קופסאות|זרוע|זרועות|מכונת|מכונה|מכונות|טוחנת|טוחנות|מטחנת|מטחנה|מטחנות|מקציף|משטח|פודים|קומקום|מיחם|מגהץ|שואב|מטהר|מאוורר|ברז|ברזי|טאבון|טאבונים|מנגל|מנגלים|מטבח|פלאנצה|בלון|מושב|מצנם|מצנמים|טוסטר|טוסטרים|מיקסר|מיקסרים|אינדוקציה|משקל|מעבד|מעבדי|בלנדר|בלנדרים|קוצץ|קוצצים)/;

// Same failure mode as PRODUCT_TYPE_WORDS above, different word class: a
// quantity/color/condition word sitting where a brand name is expected —
// confirmed on real synced data ("זוג" (pair) extracted as the brand for
// a dozen+ speaker pairs whose real brand, e.g. Klipsch, was mentioned
// later in the same description; "שחור"/"חדש"/"נייד" the same way for
// other rows). None of these describe a manufacturer, so a candidate that
// consists ONLY of one of these words (whole match, not merely containing
// one) is rejected the same way a product-type divider is.
const NON_BRAND_WORDS =
  /^(זוג|יחיד|בודד|זוגי|חדש|חדשה|ישן|שנה|שנים|נייד|ניידת|קדם|נירוסטה|דיגיטלי|דיגיטלית|אוטומטי|אוטומטית|ידני|ידנית|קומפקטי|קומפקטית|מקצועי|מקצועית|ביתי|ביתית|חשמלי|חשמלית|שחור|לבן|אפור|כסוף|זהב|זהוב|כחול|ורוד|אדום|ירוק|צהוב|חום|בז'|מוצר מועדף|כל סוגי ה?|סט|סטים|סדרה|סדרת|דגם|דגמים|כללי|שונות|אחר)$/;

function isBrandLike(label: string): boolean {
  // A divider is more likely a sub-category label than a brand name when it
  // contains an obvious product-type word ("headphones", "speakers", ...).
  // Short, product-word-free labels ("GAGGIA", "B&W", "EAZO") are the
  // opposite: exactly what a brand name looks like.
  return (
    !PRODUCT_TYPE_WORDS.test(label) &&
    !NON_BRAND_WORDS.test(label.trim()) &&
    label.length > 0 &&
    label.length < 24
  );
}

// A model code is not a manufacturer, and a size is not part of one. Both
// are in the catalog today filed as brands: DS82, R8SW, PRO16RW, R100SW,
// R120SWI and CHS8000 are model numbers with their own brand row, and one
// real brand — לקסוס — is split four ways by the measurement printed after
// it ("לקסוס 3 מ'", "לקסוס 1 מ'", "לקסוס 2 מדפים").
//
// Rejecting those cells outright would throw away the real name sitting
// next to the noise, so the cell is cleaned first and judged afterwards:
// "כרומקס CHS8000" becomes "כרומקס", "לקסוס 3 מ'" becomes "לקסוס", and
// "DS82" becomes nothing at all, which is the correct answer for it.

// A single token carrying both Latin letters and digits, four characters
// or more — DS82, R8SW, PRO16RW, CHS8000. Four and not two because 3M and
// 3i are real manufacturers and must survive; checked against all 244
// brand names in the live catalog, which this rejects none of.
const MODEL_CODE_TOKEN = /^(?=[A-Za-z0-9-]{4,}$)(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9-]+$/;

// A number followed by a unit or a countable part — the text a price sheet
// appends to a brand to distinguish two lines of the same product.
const TRAILING_MEASUREMENT =
  /\s*\d+(?:[.,]\d+)?\s*(?:מ'|מטר|ס"?מ|סמ|ק"?ג|אינץ'?|ליטר|וואט|w|W|מדפים|מדף|ערוצים|ערוץ|דלתות|רשתות|מערכות|סלסלאות)\s*$/;

// A bare number left at the end once a unit has been stripped, or one that
// never had a unit: "סט 5.1", "קבוצה 3".
const TRAILING_BARE_NUMBER = /\s+\d+(?:[.,]\d+)*\s*$/;

export function cleanBrandCell(value: string): string | null {
  let v = value.replace(/\s+/g, " ").trim();

  // Repeated because a cell can carry more than one — "לקסוס 2 מדפים 3 מ'"
  // — and because stripping one can expose the next.
  for (let i = 0; i < 4; i++) {
    const before = v;
    v = v.replace(TRAILING_MEASUREMENT, "").trim();
    v = v.replace(TRAILING_BARE_NUMBER, "").trim();
    // A trailing product-type word: "קאסו משקל", "אומגה משקל" are the brand
    // with the thing it sells stuck on the end. Only when a word survives in
    // front of it — "מיקסר יד" and "בלנדר מוט" are product types all the way
    // through and have no brand hiding inside them.
    const words = v.split(" ");
    if (words.length > 1 && PRODUCT_TYPE_WORDS.test(words[words.length - 1])) v = words.slice(0, -1).join(" ").trim();
    // A trailing model code, but again only when something is left in front:
    // a cell that is nothing but a model code has no brand in it to keep.
    const parts = v.split(" ");
    while (parts.length > 1 && MODEL_CODE_TOKEN.test(parts[parts.length - 1])) parts.pop();
    v = parts.join(" ").trim();
    if (v === before) break;
  }

  if (!v || MODEL_CODE_TOKEN.test(v)) return null;
  return isPlausibleBrandCell(v) ? v : null;
}

// Whether a value sitting in a sheet's BRAND column is worth believing.
// That column is not clean: alongside real manufacturer names it collects
// promo codes ("15//1"), category labels ("בלנדר מוט", "מעבדי מזון") and
// pack counts written where a name belongs ("5 גז רשתות") — all of which
// are in the live catalog today, filed as if they were manufacturers. That
// is the reason the yellow-highlight convention exists. Rather than
// distrust the whole column, judge the individual cell, and hold it to the
// same bar a section divider has to clear: this decides whether the row's
// own value outranks the brand block it sits in, so a value that fails
// here must fall through rather than win.
export function isPlausibleBrandCell(value: string): boolean {
  const v = value.trim();
  if (v.length < 2 || v.length > 24) return false;
  if (!/[A-Za-z\u0590-\u05FF]/.test(v)) return false;
  if (/^[\d/\\.\-\s]+$/.test(v)) return false;
  // A leading count — "5 גז רשתות", "3 סלסלאות דיגיטלי 15". Requires the
  // whitespace: "3i" and "3M" are real manufacturers and must survive.
  if (/^\d+\s/.test(v)) return false;
  if (NON_BRAND_WORDS.test(v)) return false;
  if (PRODUCT_TYPE_WORDS.test(v)) return false;
  return true;
}

export function brandLikeDividers(dividerLabels: string[]): string[] {
  return [...new Set(dividerLabels)].filter(isBrandLike);
}

export function extractBrand(description: string, knownBrands: string[]): string | null {
  const desc = description.trim();
  if (!desc) return null;

  // "פיליפס - אוזניות..." / "JBL - אוזניות..." — an explicit separator is
  // the strongest signal there is.
  const dash = desc.match(/^([֐-׿][֐-׿ ]{1,20}?)\s*-\s*/);
  if (dash) return dash[1].trim();

  // "ALCTRON מגבר..." — an all-caps Latin token with no separator.
  const caps = desc.match(/^([A-Z][A-Z0-9&.]{1,15})\b/);
  if (caps) return caps[1];

  // A brand name this workbook already told us about (via a yellow
  // divider elsewhere in the same source) appearing at the very start.
  const known = knownBrands.find((b) => desc.startsWith(b));
  if (known) return known;

  // Last resort: whatever text sits before the first recognizable
  // product-type word is very likely the brand — "ריצ'טק רמקול נייד..."
  // -> "ריצ'טק". Only trusted when that leading text is a plausible name
  // (not empty, not just digits, not the whole sentence).
  const productWordMatch = desc.match(PRODUCT_TYPE_WORDS);
  if (productWordMatch && productWordMatch.index && productWordMatch.index > 0) {
    const candidate = desc.slice(0, productWordMatch.index).trim().replace(/[-–]$/, "").trim();
    // "זוג רמקולים..." ("a pair of speakers...") -> the text before
    // "רמקולים" is "זוג", a quantity word, not a brand — same guard as
    // isBrandLike uses for divider labels, applied here too since this is
    // the same "leading text before a product word" heuristic on a
    // different kind of input (free-text description vs. a divider row).
    if (candidate.length >= 2 && candidate.length <= 25 && !/^\d+$/.test(candidate) && !NON_BRAND_WORDS.test(candidate)) {
      return candidate;
    }
  }

  return null;
}

// Fallback for rows whose description doesn't mention the brand at all —
// common on sheets like "מנגלים ומטבחי חוץ מבית אביגיל", where the brand
// only ever appears once, on the section divider that groups those rows.
export function extractBrandFromDivider(sectionLabel: string | null): string | null {
  if (!sectionLabel) return null;

  // "...מבית X" ("from the house of X") is a common Hebrew retail phrase
  // naming the supplier/brand at the end of an otherwise category-ish label.
  const fromHouseOf = sectionLabel.match(/מבית\s+(.+)$/);
  if (fromHouseOf) return fromHouseOf[1].trim();

  // A trailing (or, failing that, leading) all-caps Latin brand token, e.g.
  // "מוצרי ברזי מים WOTERLABS" or "EAZO מתקנים".
  const trailingCaps = sectionLabel.match(/([A-Z][A-Z0-9&.]{1,15})\s*$/);
  if (trailingCaps) return trailingCaps[1];
  const leadingCaps = sectionLabel.match(/^([A-Z][A-Z0-9&.]{1,15})\b/);
  if (leadingCaps) return leadingCaps[1];

  // The whole divider reads as a brand name outright (no category words in
  // it) — e.g. a standalone "GAGGIA" or "B&W" divider.
  if (isBrandLike(sectionLabel)) return sectionLabel;

  return null;
}

// Reading a manufacturer out of a product's own title, against the list of
// brands the catalog already holds.
//
// This is the recovery path, not an import path: 93 products carry the
// placeholder brand "לא ידוע" because they came from accessory tabs — cables,
// mounts, extractor hoods — that have no BRAND column and no yellow dividers,
// so extractBrand had nothing to work from and correctly returned null rather
// than guessing. But 29 of them write the manufacturer plainly in their own
// title: "לקסוס 1.5 מ' 3RCA ל 3RCA", "כבל אופטי 1.5 מ' HAMA דגם 42927".
//
// Matching only against brands that already exist means nothing is invented —
// the name has to be one this catalog already uses. Longest first, so
// "פיור אקוסטיק" wins over "פיור", and a Hebrew-aware boundary on both sides,
// because \b is defined on ASCII word characters and never matches between two
// Hebrew letters: without it "בקו" would match inside "בקורת".
const LETTER = "A-Za-z\u0590-\u05FF";

export function brandFromTitle(title: string, catalogBrands: string[]): string | null {
  const text = title.trim();
  if (!text) return null;
  // Two characters is enough for a Latin name — LG and GE are real, and the
  // boundary below keeps them out of the middle of a longer token. Hebrew
  // needs three: two-letter Hebrew strings are prepositions and prefixes far
  // more often than they are manufacturers.
  const candidates = [...catalogBrands]
    .map((b) => b.trim())
    .filter((b) => (/^[A-Za-z0-9&.\- ]+$/.test(b) ? b.length >= 2 : b.length >= 3))
    .sort((a, b) => b.length - a.length);
  for (const brand of candidates) {
    const escaped = brand.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(?<![${LETTER}])${escaped}(?![${LETTER}])`).test(text)) return brand.trim();
  }
  return null;
}
