/**
 * Recognising the colour in a product title, and the appliance underneath it.
 *
 * Kept out of the script so the grouping rule and the product page's label
 * for a swatch are the same code. Two places deciding separately what
 * "שחור מט" is would drift, and the drift would show up as a swatch whose
 * name does not match the page it leads to.
 */

/**
 * Longest first — the order is the rule, not a tidy-up.
 *
 * "נירוסטה מושחרת" contains "נירוסטה", and "שחור מט" contains "שחור". Match
 * the short one first and a black-stainless oven is filed as stainless,
 * sitting in the same group as the actual stainless one under the same
 * label. Sorting by length at the point of use means adding a value here
 * never needs anyone to remember this.
 */
const COLOR_TERMS = [
  "נירוסטה מושחרת",
  "נירוסטה מוושחרת",
  "זכוכית שחורה מט",
  "זכוכית שחורה",
  "זכוכית לבנה",
  "שחור פלטינה",
  "שחור גרפית",
  "שחור זכוכית",
  "כחול פסטל",
  "שחור מט",
  "לבן מט",
  "לבן כפרי",
  "קרם כפרי",
  "שמנת כפרי",
  "אפור כהה",
  "נירוסטה",
  "גרפיט",
  "שמנת",
  "כסוף",
  "אגוז",
  "לבן",
  "שחור",
  "קרם",
  "אפור",
  "זהב",
  "אדום",
  "כחול",
] as const;

const SORTED = [...COLOR_TERMS].sort((a, b) => b.length - a.length);

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const COLOR_RE = new RegExp(`(${SORTED.map(escapeRe).join("|")})`, "g");

/** The colour a title names, or null. The first match wins: a title that
    says both a body colour and a trim colour is led by the body. */
export function colorInTitle(title: string): string | null {
  COLOR_RE.lastIndex = 0;
  return COLOR_RE.exec(title)?.[1] ?? null;
}

/**
 * The title with every colour word removed and the leftover punctuation
 * collapsed — what two finishes of one appliance have in common.
 *
 * The separators go too. "מיקרוגל LaCasa LC20MGB - שחור" and
 * "מיקרוגל LaCasa LC20MGB - לבן" leave a trailing dash behind once the
 * colour is gone, and one of them writes it as "—"; without collapsing
 * those the two never meet.
 */
export function titleWithoutColor(title: string): string {
  return title.replace(COLOR_RE, " ").replace(/[\s\-–—,/]+/g, " ").trim();
}
