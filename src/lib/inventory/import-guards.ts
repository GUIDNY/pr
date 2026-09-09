// Two things the import lets through that are not what they claim to be:
// an EU energy label saved as the product photo, and a line of marketing
// copy saved as the product name. Both come from the same place — the
// scraper and the supplier sheet take whatever is in the cell — and both
// are cheap to recognise and expensive to leave in the catalog: one puts a
// coloured A–G chart on a category page where a fridge should be, the
// other puts "חיישנים+קונדנסור+אפשרות ניקוז" in the <h1>.
//
// Both are conservative on purpose. A guard that also rejects real photos
// and real names costs more than the thing it prevents, so each one only
// fires on evidence, and the ambiguous case is always "let it through".

// ---------------------------------------------------------------------------
// Energy labels
// ---------------------------------------------------------------------------

// The shape rule: an EU energy label is a tall, narrow strip — the standard
// artwork is roughly 1:2 and the files that turn up here are small. A real
// product photo, even of a tall fridge, does not usually reach 1.9 with a
// width under 500px.
//
// This needs the image's actual pixel size, which the import does not have:
// it is handed a URL, and fetching every image at import time would make a
// sync as slow and as unreliable as the least reliable host in the sheet.
// So the shape test lives in the audit script, which fetches and measures
// (scripts/check-energy-labels.ts), and the import uses the filename test
// below, which is free.
export const ENERGY_LABEL_MIN_RATIO = 1.9;
export const ENERGY_LABEL_MAX_WIDTH = 500;

export function hasEnergyLabelShape(width: number, height: number): boolean {
  if (!width || !height) return false;
  return height / width >= ENERGY_LABEL_MIN_RATIO && width < ENERGY_LABEL_MAX_WIDTH;
}

// The filename test. Scrapers keep the source filename far more often than
// not, and an energy label is almost always named for what it is — in
// English on manufacturer sites, in Hebrew on Israeli ones. EPREL is the
// EU's energy-label registry, so a URL pointing into it is a label by
// definition.
//
// Anchored on word boundaries rather than a bare substring: "energy" alone
// would reject a perfectly good photo of an appliance whose model name
// contains it (Energy Star badges, "EnergySave" model lines), and the
// Hebrew "אנרגיה" appears in plenty of legitimate marketing filenames.
// A hyphen or underscore next to the word is what separates a filename
// token from a word inside a longer name.
const ENERGY_LABEL_FILENAME =
  /(^|[/_\-.])(energy[_-]?label|energylabel|energy[_-]?class|eprel|label[_-]?energy|תווית[_-]?אנרגיה|דירוג[_-]?אנרגטי)([_\-.]|$)/i;

// eprel.ec.europa.eu serves nothing but energy labels, so on that host the
// path does not have to say so.
const ENERGY_LABEL_HOST = /(^|\.)eprel\.ec\.europa\.eu$/i;

export function looksLikeEnergyLabelUrl(url: string): boolean {
  const host = url.replace(/^https?:\/\//i, "").split("/")[0].split(":")[0].toLowerCase();
  if (ENERGY_LABEL_HOST.test(host)) return true;
  // Otherwise only the path and query are read — a host that happens to
  // contain "label" (labelstore.example) is not a claim about this
  // particular image.
  const withoutHost = url.replace(/^https?:\/\/[^/]+/i, "");
  let path = withoutHost;
  try {
    path = decodeURIComponent(withoutHost);
  } catch {
    // A malformed %-escape is not a reason to reject the image; read the
    // raw path instead.
  }
  return ENERGY_LABEL_FILENAME.test(path);
}

// ---------------------------------------------------------------------------
// Titles that are copy, not names
// ---------------------------------------------------------------------------

// The sheet's description column is the product title when it has one, and
// sometimes it holds a spec list instead: two live products came in named
// "חיישנים+קונדנסור+אפשרות ניקוז", which is three features joined by plus
// signs and names no product at all.
//
// A real title carries an identifier — a model code, a capacity, a size —
// so the test is: does this string contain anything that could identify a
// product? A Latin run of two or more characters (a brand or a model code)
// or a number both count. A string with neither, built out of feature
// words joined by separators, is copy.
const IDENTIFIER = /[A-Za-z]{2,}|\d/;
const FEATURE_JOINERS = /[+&/]|,\s|\s-\s|\s\+\s/g;

export function looksLikeMarketingTitle(title: string): boolean {
  const t = title.replace(/\s+/g, " ").trim();
  if (!t) return false;
  // Anything with a model code or a number in it names something. This is
  // the check that keeps the guard off almost every real title in the
  // catalog, including the ugly ones.
  if (IDENTIFIER.test(t)) return false;
  // Two or more feature separators in an all-Hebrew string with no
  // identifier anywhere: "חיישנים+קונדנסור+אפשרות ניקוז".
  const joins = (t.match(FEATURE_JOINERS) ?? []).length;
  return joins >= 2;
}

// ---------------------------------------------------------------------------
// A stock status typed into the model column
// ---------------------------------------------------------------------------

// Four air-conditioner products in the catalog are called "SOMO אזל זמנית".
// That is not a product name and never was: the sheet's דגם column held the
// supplier's note about availability instead of a model number, and with no
// description on the row the title fell back to brand + model.
//
// So a MODEL cell whose whole content is an availability phrase is not a
// model. It is dropped, the row falls through to whatever the description
// can give, and MISSING_MODEL puts it in the "טיפול" queue — which is
// exactly where a line the supplier could not name belongs.
//
// Whole-cell only. A real model code that happens to contain one of these
// words ("EZEL", a model named חסר) keeps it: the phrase has to be the
// entire value, with nothing else in the cell, for it to be a status rather
// than a name.
const STOCK_PHRASE =
  /^(אזל|אזל מהמלאי|אזל זמנית|זמנית אזל|חסר|חסר במלאי|לא במלאי|אין במלאי|לא זמין|בהזמנה|בהזמנה מראש|הופסק|הופסק ייצור|out of stock|sold out|discontinued|n\/?a)$/i;

export function looksLikeStockPhrase(value: string): boolean {
  return STOCK_PHRASE.test(value.replace(/\s+/g, " ").trim().replace(/[.!:;]+$/, ""));
}

// ---------------------------------------------------------------------------
// A price typed into a quantity cell
// ---------------------------------------------------------------------------

// Eight rows of the white-goods sheet carry a price where a count belongs.
// "בונדד ספק" is a real quantity column — 131 of its 144 values in this
// catalog are between 1 and 20 — but on those eight rows it holds 9900,
// 7900, 6900, 5000, sitting next to a manager code of 12900 and a cost of
// 13900. The same rows say "אזל-למכור מלאי ותצוגות" in their notes and
// carry the real count, 1 or 2, in a different column.
//
// So the classifier is right and the sheet is wrong, which is exactly the
// case an import has to survive: a supplier's typo became 9,901 units of a
// ₪12,900 fridge, published, and a customer could order one.
//
// The test is the line's value rather than the count alone, because a count
// alone cannot be judged — 500 is absurd for a built-in oven and ordinary
// for a cable. A single SKU worth more than a million shekels is not a
// stock level, it is a number in the wrong box. Both conditions must hold,
// so a warehouse genuinely holding 20,000 cheap cables is not caught.
//
// Calibrated against the live catalog: 13 rows match, every one of them a
// misplaced price, and nothing else out of 1,996 products.
export const IMPLAUSIBLE_LINE_VALUE = 1_000_000;
export const IMPLAUSIBLE_MIN_QUANTITY = 100;

export function looksLikeMisplacedQuantity(quantity: number, price: number | null): boolean {
  if (!Number.isFinite(quantity) || quantity < IMPLAUSIBLE_MIN_QUANTITY) return false;
  if (!price || !Number.isFinite(price) || price <= 0) return false;
  return quantity * price >= IMPLAUSIBLE_LINE_VALUE;
}

// The line-value test above judges one number. It cannot see the case where a
// whole row's columns are shifted, and that case is in this catalog: the tab
// "גריל גז ומערכות מים" has the colour under "מחיר מינ'", the price under
// "מוצג", a second price under "תצוגות LUXERY" — read as showroom stock — and
// a margin ratio under "מלאי LUXRY", read as warehouse stock.
//
// A count of 990 at ₪708 is worth ₪700,920, under the million, so the row
// passes the test above and went live claiming 990 water bars. What gives it
// away is the neighbour: 0.2570621468926553 in a column that holds units.
//
// So this is the second tell, and it needs no threshold at all — a fraction is
// never a quantity. Seven rows in the catalog have one, all seven from these
// two tabs, and six of them carry a price where the count belongs.
export function looksLikeOffsetStockRow(lines: { quantity: number }[]): boolean {
  return lines.some((line) => Number.isFinite(line.quantity) && !Number.isInteger(line.quantity));
}

/**
 * Whether a sheet row's model and a product's model can be the same thing.
 *
 * Position — sourceId + sheet + row number — is the first way a row is
 * matched to the product it made last time, and it is the way that fails
 * silently. A row inserted or removed above shifts everything under it by
 * one, and then every product in that block is matched to its neighbour's
 * row. Nothing about that looks wrong: the row parses, the product updates,
 * the sync reports success. What actually happened is that 26 live products
 * took their stock quantity and their whole warehouse breakdown from a
 * different appliance.
 *
 * The sheet carries the answer in its own model column. So a position match
 * is only trusted when the two models can be read as the same model.
 *
 * "Can be read as" and not "are equal", because they are written differently
 * on purpose and both spellings are right. The sheet abbreviates — "7310IX"
 * for a product we call "CUISINE-7310IX", "9630SL" for "SJ-9630SL" — and
 * enrichment fills in the manufacturer's full designation. Punctuation and
 * case vary freely. Containment after stripping both covers all of that and
 * still separates STK60GHX from STK70GHX, EP7A6SB95Y from EP7A6QI40Y, and
 * CH74BVT from MGH90GB, which are the pairs that were actually swapped.
 *
 * Either side missing means the sheet is not saying anything about identity,
 * and silence is not a contradiction: the match stands.
 */
export function modelsCanBeTheSame(
  productModel: string | null | undefined,
  rowModel: string | null | undefined,
): boolean {
  const a = bareModel(productModel);
  const b = bareModel(rowModel);
  if (!a || !b) return true;
  return a.includes(b) || b.includes(a);
}

function bareModel(value: string | null | undefined): string {
  return (value ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}
