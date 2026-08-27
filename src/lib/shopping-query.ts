// A light, regex-based reading of shopping queries like "מכונת כביסה עד
// 5000 ש״ח" — pulls out a price ceiling if the query states one, leaving
// the rest as plain text for the existing search. Deliberately not an LLM
// call: no network round-trip, nothing to review before it goes live, and
// it degrades gracefully — a query with no price phrase in it just
// searches as plain text, same as before.
const PRICE_PATTERNS = [
  /(?:עד|מתחת ל-?|פחות מ-?)\s*₪?\s*([\d,]+)\s*(?:₪|ש"ח|ש״ח|שח)?/,
  /₪\s*([\d,]+)\s*(?:ומטה|לכל היותר)/,
];

// Real product titles are often just "brand + model" with no description
// text at all, and Hebrew singular/plural word forms ("מכונת" vs "מכונות")
// don't substring-match each other — so matching the query as one whole
// phrase misses almost everything real users type. Splitting into
// individual words and matching if ANY of them shows up in ANY field is
// far more forgiving, at the cost of being less precise; for a catalog
// this size, more recall is the right trade.
export function splitSearchWords(text: string): string[] {
  return text
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2);
}

export function parseShoppingQuery(query: string): { text: string; maxPrice: number | null } {
  const trimmed = query.trim();
  for (const pattern of PRICE_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      const maxPrice = Number(match[1].replace(/,/g, ""));
      if (Number.isFinite(maxPrice) && maxPrice > 0) {
        const text = trimmed.replace(match[0], " ").replace(/\s+/g, " ").trim();
        return { text, maxPrice };
      }
    }
  }
  return { text: trimmed, maxPrice: null };
}
