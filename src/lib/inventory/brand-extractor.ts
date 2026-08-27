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
  /^(זוג|יחיד|בודד|זוגי|חדש|חדשה|ישן|שנה|שנים|נייד|ניידת|קדם|נירוסטה|דיגיטלי|דיגיטלית|אוטומטי|אוטומטית|ידני|ידנית|קומפקטי|קומפקטית|מקצועי|מקצועית|ביתי|ביתית|חשמלי|חשמלית|שחור|לבן|אפור|כסוף|זהב|זהוב|כחול|ורוד|אדום|ירוק|צהוב|חום|בז'|מוצר מועדף|כל סוגי ה?)$/;

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
