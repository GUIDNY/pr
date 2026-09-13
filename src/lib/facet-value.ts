/**
 * One chip per real answer, out of values that were typed by many hands.
 *
 * The spec values in this catalogue came from suppliers, from the enrichment
 * agent and from people, and they disagree about everything except the
 * number. Washing-machine capacity is stored as "8" and as `8 ק"ג`; width as
 * `60 ס״מ`, as `60 ס"מ` with the other quote character, and as "60"; noise as
 * "72", "75dB" and "79 dBA"; and "מספר תוכניות" contains, for three
 * products, the string "לא צוין".
 *
 * Rendered as they are, that is two chips for one capacity — a shopper picks
 * "8", gets twelve products and never sees the two filed under `8 ק"ג` — and
 * an option called "not specified" that a shop is offering people to choose.
 *
 * So values are folded here, for display and for the query behind one chip,
 * and the rows are left exactly as they are. Cleaning the database is the
 * right fix and a different job; this one has to be safe to run on every
 * category page tonight.
 *
 * What it will NOT do is decide that 59.8 and 60 are the same width. They
 * are different numbers that somebody wrote down on purpose, and merging
 * them would be inventing a spec rather than tidying one.
 */
const PLACEHOLDER_VALUES = new Set(["לא צוין", "לא רלוונטי", "לא ידוע", "אין", "-", "--", "n/a", "na", "null"]);

/* Trailing units, longest first so that ס״מ is matched before מ. Only ever
   stripped from the END of the value: "60 ס״מ" is a width, "מ 60" is not a
   thing anybody typed. */
const TRAILING_UNITS = [
  "קילוגרם", "ק\"ג", "קג", "סנטימטר", "ס\"מ", "סמ", "מ\"מ", "מילימטר",
  "ליטר", "לטר", "אינץ'", "אינטש", "וואט", "ואט", "הרץ",
  "dBA", "dB", "kg", "cm", "mm", "inch", "in", "hz", "w",
];

export function normalizeFacetValue(raw: string): string | null {
  let value = raw
    // The two Hebrew geresh characters and the ASCII quote are the same
    // punctuation to a reader and three different strings to a Map key.
    .replace(/[״”“]/g, '"')
    .replace(/[׳’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();

  if (!value) return null;
  if (PLACEHOLDER_VALUES.has(value.toLowerCase())) return null;

  for (const unit of TRAILING_UNITS) {
    const pattern = new RegExp(`\\s*${unit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.?$`, "i");
    if (pattern.test(value)) {
      value = value.replace(pattern, "").trim();
      break;
    }
  }

  if (!value) return null;
  // "08" and "8" are one number; "8.0" and "8" are one measurement.
  const asNumber = Number(value);
  if (Number.isFinite(asNumber) && /^[\d.]+$/.test(value)) return String(asNumber);
  return value;
}

