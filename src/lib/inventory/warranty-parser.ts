/**
 * The price list's warranty column, turned into something a product page can
 * state without a person re-reading the sheet.
 *
 * The owner's rule, 19 October: what the sheet says about warranty goes on the
 * page as text. The extension is bought from the supplier, not from us, so
 * nothing here is a line item — it is a sentence the customer reads.
 *
 * Why a parser rather than printing the cell: the cell is shorthand. "1+2(שח199)+9 מדחס"
 * is four facts in eleven characters, and a page that prints it raw is a page
 * that tells the customer nothing. 164 distinct phrasings across 1,915 rows,
 * every one of them read off the three real workbooks.
 *
 * And the column is not only warranty. Measured on the same files, it also
 * carries dimensions ("55X170X59"), a bowl's capacity ("קערה 2.1 ליטר"), a
 * wattage ("2200W"), colour codes ("לבן JW", "ניקל JCB"), bare importer
 * abbreviations ("EOB", "IAC"), a service phone ("שרות 2146*"), a credit note
 * to the supplier ("עלות אחרונה 968 לדרוש זיכוי מאיתן 2 יח'") and, on one row,
 * an availability note ("אזל למכור מלאי ותצוגה"). A warranty promise is a legal
 * statement, so a value that does not actually name a warranty returns null and
 * is reported — never guessed at.
 */

export type WarrantyCoverage = "FULL" | "COMPRESSOR" | "COOLING" | "MOTOR" | "VISIT";

export type ParsedWarranty = {
  /** Years included in the price. */
  baseYears: number | null;
  /** Extra years the customer can add, on top of baseYears. */
  extraYears: number | null;
  /** What the extension costs, in shekels, when the sheet says. */
  extraPrice: number | null;
  /** What the extension covers. The sheets distinguish these and so must we:
   *  nine years on the compressor is not nine years on the appliance. */
  extraCoverage: WarrantyCoverage | null;
  /** Who honours it — "שריג", "ניופאן", "T.R". Named on 57 rows. */
  provider: string | null;
  /** The cell, verbatim, so the admin can always see what was read. */
  raw: string;
  /** False when the cell named no warranty at all (a dimension, a colour, a
   *  note). Nothing is written to the product from an unrecognised value. */
  recognised: boolean;
};

const EMPTY = (raw: string): ParsedWarranty => ({
  baseYears: null,
  extraYears: null,
  extraPrice: null,
  extraCoverage: null,
  provider: null,
  raw,
  recognised: false,
});

/* Hebrew number words the sheets use for a year count. "שנתיים" is two; there
   is no "שלושיים", so from three up they spell the digit or the word.

   Bounded with lookarounds and not with `\b`: JavaScript's word boundary is
   defined over [A-Za-z0-9_], so a Hebrew letter is a non-word character and
   `/\bשלוש\b/` matches nothing at all. It silently never fired, and "שלוש שנים"
   came back with no term — the quiet kind of failure, since an unrecognised
   warranty simply prints nothing. */
const YEAR_WORDS: [RegExp, number][] = [
  [/שנתיים/, 2],
  [/(?<![א-ת])שלוש(?![א-ת])/, 3],
  [/(?<![א-ת])ארבע(?![א-ת])/, 4],
  [/(?<![א-ת])חמש(?![א-ת])/, 5],
  [/(?<![א-ת])שש(?![א-ת])/, 6],
  [/(?<![א-ת])שבע(?![א-ת])/, 7],
  [/(?<![א-ת])שמונה(?![א-ת])/, 8],
  [/(?<![א-ת])תשע(?![א-ת])/, 9],
  [/(?<![א-ת])עשר(?![א-ת])/, 10],
];

/* Values that are certainly not a warranty. Checked before anything else, so a
   stray digit inside them can never be read as a year count. Each entry is a
   real value from the current workbooks. */
const NOT_A_WARRANTY: RegExp[] = [
  /\d+\s*[xX×]\s*\d+/, //   55X170X59, 60X172X69
  /\d+\s*W\b/i, //          2200W
  /קערה|כוס|בלנדר|מסחטת|בצק|חלה|מוט|גימור|משקל|טיימר|תוכניות/, // accessory specs
  /ליטר|ק"ג|קוטר/,
  /עלות|זיכוי|מכורים|החזרה|בונוס|מבצע סט/, //  supplier bookkeeping
  /מיוצר|יצור|^ת\s/, //     country of origin
  /אזל|סוף דגם|תצוגת|מתחלף/, // availability — belongs to availability.ts
  /^\*?\d{4}\*?$|\*\d{4}/, // a service phone: "שרות 2146*"
  /^[A-Z]{3}(\s*\/\s*[A-Z]{3})?$/, // bare importer codes: EOB, IAC, "EOB / IOB"
  /^(שחור|לבן|ניקל|כרום|קרם)\s+[A-Z]{2,4}$/, // colour codes: "לבן JW"
];

/* The companies named in the column. Longest first so "המילטון" is not matched
   as a fragment of something else, and so "א.ח.י דיגיטל" wins over "א.ח.י". */
const PROVIDERS = [
  "א.ח.י דיגיטל",
  "מוזר ישראל",
  "נספרסו ישראל",
  "גלובל סאונד",
  "אס ג'י",
  "סמליין",
  "קונקטור",
  "המילטון",
  "אלקטרה",
  "ניופאן",
  "ניפאן",
  "ניפרו",
  "סיריוס",
  "ראלקו",
  "א.ט.ד",
  "שריג",
  "מורפי",
  "דודו",
  "T.R",
  "ט.ר",
];

function findProvider(t: string): string | null {
  for (const p of PROVIDERS) if (t.includes(p)) return p;
  return null;
}

function findCoverage(t: string): WarrantyCoverage | null {
  if (/מדחס/.test(t)) return "COMPRESSOR";
  if (/קירור/.test(t)) return "COOLING";
  if (/מנוע|למנוע/.test(t)) return "MOTOR";
  if (/ביקור/.test(t)) return "VISIT";
  if (/מלא/.test(t)) return "FULL";
  return null;
}

/* The price of the extension.
 *
 * Trying to anchor it on a money word does not work, because half the sheet
 * does not write one: "שנה + 2 ביקור טכנאי 249", "1+2ש 199 מדחס" (ש for שח),
 * "199 מבצע 1+2 הרחבה" (the number first, four words from "הרחבה"). Eight
 * phrasings, 240 rows, all of them price-less under an adjacency rule.
 *
 * What does separate a price from a year, reliably, is its size. Term lengths
 * in this column are one digit each side of the plus, and the longest extension
 * anyone writes is nine years ("1+9 מדחס") — the only two-digit term is
 * "שנתיים ו 15 למנוע". Prices start at 33 ("אחריות ל 3 שנים בתוספת 33 שח").
 * Nothing in between, so 33 separates them with room to spare.
 *
 * The N+N pair is cut out of the string first regardless, so "1+2(שח199)+9"
 * cannot offer its 9 as a candidate. */
const BASE_PLUS_EXTRA = /\d\s*\+\s*\d{1,2}/;
const MIN_PRICE = 33;

function findPrice(t: string): number | null {
  const withoutTerms = t.replace(BASE_PLUS_EXTRA, " ");
  let best: number | null = null;
  for (const m of withoutTerms.matchAll(/\d{2,4}/g)) {
    const n = Number(m[0]);
    if (n >= MIN_PRICE && n <= 2000 && (best === null || n > best)) best = n;
  }
  return best;
}

/**
 * Parse one warranty cell.
 *
 * Shapes handled, all drawn from the live workbooks:
 *   "שנה אחת"                      → base 1
 *   "שנתיים מלא"                   → base 2, full
 *   "5 שנים מלא" / "7.שנים מלא"    → base 5 / 7, full
 *   "1+2 הרחבה"                    → base 1, +2
 *   "שנה + 2 ב 199 שח"             → base 1, +2 for 199
 *   "1+9 מדחס 149 שח"              → base 1, +9 on the compressor for 149
 *   "1+2(שח199)+9 מדחס"            → base 1, +2 for 199 (the compressor's 9
 *                                     years is a second extension; we keep the
 *                                     first and the raw text carries the rest)
 *   "אחריות ל 4 שנים בתוספת 44 שח" → base 1, +3 to reach 4, for 44
 *   "שריג שנה אחריות"              → base 1, provider שריג
 */
export function parseWarranty(cell: string | null | undefined): ParsedWarranty {
  const raw = (cell ?? "").trim();
  if (!raw) return EMPTY(raw);
  for (const re of NOT_A_WARRANTY) if (re.test(raw)) return EMPTY(raw);

  const provider = findProvider(raw);
  const extraCoverage = findCoverage(raw);
  const extraPrice = findPrice(raw);

  /* "1+2", "1+9", "2+8" — base plus extension, the sheet's densest form and
     the most common. Anchored on the plus so "1+2" is never confused with the
     "ל 4 שנים" total form below. */
  const plus = raw.match(/(\d)\s*\+\s*(\d{1,2})/);
  if (plus) {
    return {
      baseYears: Number(plus[1]),
      extraYears: Number(plus[2]),
      extraPrice,
      extraCoverage,
      provider,
      raw,
      recognised: true,
    };
  }

  /* "שנה + 2 ב 199 שח" / "שנה+4 שנים ב99 שח למדחס" — the same thing written
     with the base spelled out. Also "שנה + שנתיים ב199", where the extension
     is a word. */
  const spelledPlus = raw.match(/שנה\s*\+\s*(?:(\d{1,2})|שנתיים|שלוש|ארבע|חמש)/);
  if (spelledPlus) {
    let extra: number | null = spelledPlus[1] ? Number(spelledPlus[1]) : null;
    if (extra === null) {
      const after = raw.slice(raw.indexOf("+"));
      for (const [re, n] of YEAR_WORDS) if (re.test(after)) { extra = n; break; }
    }
    return { baseYears: 1, extraYears: extra, extraPrice, extraCoverage, provider, raw, recognised: true };
  }

  /* "אחריות ל 4 שנים בתוספת 44 שח" — a total, not an increment. Base is the
     year the manufacturer gives; the rest is what the money buys. Four rows
     carry this shape and reading the 4 as the extension would promise five. */
  const total = raw.match(/אחריות\s*ל\s*(\d{1,2})\s*שנים/);
  if (total) {
    const t = Number(total[1]);
    return {
      baseYears: 1,
      extraYears: t > 1 ? t - 1 : null,
      extraPrice,
      extraCoverage,
      provider,
      raw,
      recognised: true,
    };
  }

  /* A plain year count: digits ("3 שנים", "3.שנים", "3שנים", "1 שנה") or a
     word ("שנתיים", "חמש שנים"). "חמש 5 שנים" has both and either answer is 5. */
  const digits = raw.match(/(\d{1,2})\s*\.?\s*שנ(?:ים|ה)/);
  if (digits) {
    return { baseYears: Number(digits[1]), extraYears: null, extraPrice, extraCoverage, provider, raw, recognised: true };
  }
  for (const [re, n] of YEAR_WORDS) {
    if (re.test(raw)) {
      return { baseYears: n, extraYears: null, extraPrice, extraCoverage, provider, raw, recognised: true };
    }
  }
  /* "שנה", "שנה אחת", "שנה 1", "שנה בחנות", "שנה - ראלקו" — one year, however
     it is qualified. Last, so "שנתיים" and "שנה + 2" have already been taken. */
  if (/שנה/.test(raw)) {
    return { baseYears: 1, extraYears: null, extraPrice, extraCoverage, provider, raw, recognised: true };
  }

  /* A provider on its own ("סיריוס", "גלובל סאונד") names who honours the
     warranty without saying how long. Worth keeping — the page can name the
     service company — but there is no term to state. */
  if (provider) {
    return { baseYears: null, extraYears: null, extraPrice: null, extraCoverage, provider, raw, recognised: true };
  }

  return EMPTY(raw);
}

/* The sentence the product page prints. Hebrew, and never more than the sheet
   actually said: no term, no sentence. The extension is bought from the
   supplier, so the wording points there rather than offering it as a purchase. */
export function warrantySentence(w: ParsedWarranty): string | null {
  if (!w.recognised) return null;
  const years = (n: number) => (n === 1 ? "שנה" : n === 2 ? "שנתיים" : `${n} שנים`);
  const parts: string[] = [];

  if (w.baseYears !== null) {
    parts.push(`אחריות ${years(w.baseYears)}${w.provider ? ` באחריות ${w.provider}` : ""}`);
  } else if (w.provider) {
    parts.push(`אחריות באחריות ${w.provider}`);
  }

  if (w.extraYears !== null) {
    const coverage =
      w.extraCoverage === "COMPRESSOR"
        ? " על המדחס"
        : w.extraCoverage === "COOLING"
          ? " על מערכת הקירור"
          : w.extraCoverage === "MOTOR"
            ? " על המנוע"
            : w.extraCoverage === "VISIT"
              ? " הכוללת ביקור טכנאי"
              : "";
    const total = w.baseYears !== null ? w.baseYears + w.extraYears : null;
    const reach = total !== null ? ` ל-${years(total)}` : ` ב-${years(w.extraYears)} נוספות`;
    const price = w.extraPrice !== null ? ` בתוספת ${w.extraPrice} ₪` : "";
    parts.push(`ניתן להרחיב${reach}${coverage}${price} מול הספק`);
  }

  return parts.length ? parts.join(". ") + "." : null;
}
