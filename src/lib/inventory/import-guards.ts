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
