/**
 * "בלאק נובמבר" — which products are in it, and what may be said about them.
 *
 * The supplier marks the rows himself: the price list's "הערות+מבצעים" cell
 * reads "מבצע BLACK FRIDAY" on the televisions he is running the offer on
 * (19 rows of the מסכים tab on 15 November, all LG). The sync already keeps
 * the whole row, cell for cell, in `Product.stockBreakdown` and rewrites it
 * on every run — so the mark arrives twice a day with everything else, and a
 * product joins or leaves the homepage section when the supplier adds or
 * removes the words. Nothing here is a list anybody has to maintain, and
 * nothing is written to a product.
 *
 * What the section says is the owner's decision of 16 November, in his words:
 * "פשוט תרשום מחיר זמני, אל תעשה הנחה ואיקס". So the price shown is the
 * price the product already has, there is no struck-through number and no
 * percentage, and the label claims only that the price is for a limited
 * time — never that it came down from something.
 */

/* Every spelling the mark could arrive in. Matched case-insensitively
   against the row snapshot. Deliberately not "BF": two letters turn up
   inside model codes, and not a bare "BLACK" either: it is a colour in
   half the model strings. On 20.11 the supplier started marking rows
   "מבצע BLACK" in the המלצה column, which none of the old spellings
   matched, so ~170 live products never reached the shelf. */
export const BLACK_NOVEMBER_ROW_MARKS = ["BLACK FRIDAY", "בלאק פריידי", "בלאק פרייד", "מבצע BLACK"] as const;

/** Whether a price-list row snapshot (Product.stockBreakdown) carries the
    supplier's mark — the same test the homepage shelf's query makes, for
    callers that already hold the row, like the Merchant feed. */
export function isBlackNovemberRow(snapshot: string | null | undefined): boolean {
  if (!snapshot) return false;
  const s = snapshot.toLowerCase();
  return BLACK_NOVEMBER_ROW_MARKS.some((mark) => s.includes(mark.toLowerCase()));
}

export const BLACK_NOVEMBER_LABEL = "מחיר בלאק נובמבר";
export const BLACK_NOVEMBER_LIMITED = "לזמן מוגבל";

/**
 * What the section may say it is a sale *of*, read off the products in it.
 *
 * On 16 November every marked row is an LG television, and the owner asked
 * for the heading to say so. It is derived rather than typed because the
 * list is the supplier's: the day he marks a Samsung or a fridge, a heading
 * that still says "LG televisions" is a false statement on the homepage, and
 * nobody would be editing this file that morning.
 */
export function blackNovemberScope(products: { title: string; brandName: string }[]): {
  headline: string;
  note: string | null;
  /** The few words for a one-line summary: "טלוויזיות LG". */
  subject: string;
} {
  const brands = new Set(products.map((p) => p.brandName));
  const allTelevisions = products.length > 0 && products.every((p) => p.title.trim().startsWith("טלוויזי"));
  const brand = brands.size === 1 ? [...brands][0] : null;

  if (allTelevisions && brand) {
    return {
      headline: `טלוויזיות ${brand} במחירי בלאק נובמבר`,
      note: `בינתיים המבצע על טלוויזיות ${brand} בלבד.`,
      subject: `טלוויזיות ${brand}`,
    };
  }
  if (allTelevisions) return { headline: "טלוויזיות במחירי בלאק נובמבר", note: null, subject: "טלוויזיות" };
  if (brand) return { headline: `מוצרי ${brand} במחירי בלאק נובמבר`, note: null, subject: `מוצרי ${brand}` };
  return { headline: "מוצרים נבחרים במחירי בלאק נובמבר", note: null, subject: "מוצרים נבחרים" };
}

/**
 * The two things somebody buying a television looks for first, read off the
 * product's own title: how big, and which kind of panel.
 *
 * The title is where both are written for a customer ("65 אינץ'", "QNED evo
 * AI Mini LED") — enrichment puts them there from the manufacturer's page.
 * Nothing is inferred: a title that does not state a size gives no size, and
 * a panel name is reported only when the title spells it. A card with a
 * missing fact shows one fact less; it never shows a guessed one.
 */
export function televisionFacts(title: string): { inches: number | null; panel: string | null } {
  const size = title.match(/(\d{2,3})\s*אינץ/);
  const inches = size ? Number(size[1]) : null;

  let panel: string | null = null;
  /* LG write it into the model code itself: OLED55B6ELA. */
  if (/OLED/i.test(title)) panel = "OLED";
  else if (/\bQNED\b/i.test(title)) panel = /mini\s*-?\s*led/i.test(title) ? "QNED Mini LED" : "QNED";
  else if (/nano\s*cell|\bNANO\b/i.test(title)) panel = "NanoCell";
  else if (/\bQLED\b/i.test(title)) panel = "QLED";

  return { inches: inches !== null && inches >= 20 && inches <= 150 ? inches : null, panel };
}

/** The spec keys the card reads for what sets one television apart from the
    next — the ones the catalogue actually fills for these sets. */
export const TV_SPEC_KEYS = ["refresh_rate_hz", "hdr", "processor"] as const;

/**
 * What tells one set from the one beside it, from its recorded specs only
 * (16 November). Two 55″ QNED Mini LED cards at 2,400 and 3,200 read the same
 * on the shelf; the model codes said nothing to a shopper. Each fact appears
 * only when the spec holds it — a missing value is left out, never inferred.
 * "120Hz", "Dolby Vision", "מעבד α8", in that order.
 */
export function televisionSpecFacts(specs: Partial<Record<(typeof TV_SPEC_KEYS)[number], string>>): string[] {
  const facts: string[] = [];
  const hz = specs.refresh_rate_hz?.trim().match(/^(\d{2,3})(?:\s*hz)?$/i);
  if (hz) facts.push(`${hz[1]}Hz`);
  if (specs.hdr && /dolby\s*vision/i.test(specs.hdr)) facts.push("Dolby Vision");
  const chip = specs.processor?.match(/α\s*(\d{1,2})/);
  if (chip) facts.push(`מעבד α${chip[1]}`);
  return facts;
}

/** The shelf's size filter. A set of 86 or 98 inches belongs with "85 and up". */
export const TV_SIZE_BUCKETS = [
  { key: "50", label: "50″", min: 0, max: 52 },
  { key: "55", label: "55″", min: 53, max: 59 },
  { key: "65", label: "65″", min: 60, max: 69 },
  { key: "75", label: "75″", min: 70, max: 79 },
  { key: "85", label: "85″+", min: 80, max: 999 },
] as const;
export type TvSizeBucketKey = (typeof TV_SIZE_BUCKETS)[number]["key"];

export function tvSizeBucket(inches: number | null): TvSizeBucketKey | null {
  if (inches === null) return null;
  return TV_SIZE_BUCKETS.find((b) => inches >= b.min && inches <= b.max)?.key ?? null;
}
