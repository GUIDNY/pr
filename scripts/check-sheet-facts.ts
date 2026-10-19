// The three things the price list says that the catalog never recorded:
// warranty, availability, and which importer a unit came through.
//
// Every case below is a cell taken from the three real workbooks — the
// 19 October upload — not an invented one. The ones that must be *refused*
// are the point of the file: a warranty on a product page is a promise, an
// availability marker decides whether the product is sellable at all, and a
// brand cell that is really an importer's name has already put an ASKO fridge
// under a brand called "ASKO י שלום".
//
//   npm run check:sheet-facts
import { parseWarranty, warrantySentence } from "../src/lib/inventory/warranty-parser";
import { sourceAvailability, sellableWithoutStock } from "../src/lib/inventory/availability";
import { splitImporterFromBrand, rowImportChannel } from "../src/lib/inventory/import-channel";

let failed = 0;
const bad = (what: string, got: unknown, want: unknown) => {
  failed++;
  console.log(`  ✗ ${what}\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`);
};

// ---------------------------------------------------------------- warranty --

type W = { base: number | null; extra?: number | null; price?: number | null; cover?: string | null };

// Shape by shape, with the row count each phrasing has in the live sheets.
const WARRANTY: [string, W][] = [
  // A plain term, however it is spelled or punctuated.
  ["שנה אחת", { base: 1 }], //                     256 rows
  ["שנה", { base: 1 }], //                          66
  ["1 שנה", { base: 1 }], //                        56
  ["1שנה", { base: 1 }], //                         44
  ["שנה אחריות", { base: 1 }], //                   40
  ["שנה 1", { base: 1 }], //                        27
  ["שנה 1 אחריות", { base: 1 }], //                 11
  ["שנה בחנות", { base: 1 }], //                     6
  ["שנתיים", { base: 2 }],
  ["שנתיים מלא", { base: 2, cover: "FULL" }], //    21
  ["שנתיים אחריות", { base: 2 }],
  ["3 שנים מלא", { base: 3, cover: "FULL" }], //    26
  ["3.שנים מלא", { base: 3, cover: "FULL" }], //    14  — the dot is a typo for a space
  ["3שנים", { base: 3 }],
  ["שלוש שנים", { base: 3 }], //                     6
  ["5 שנים מלא", { base: 5, cover: "FULL" }], //    28
  ["5.שנים מלא", { base: 5, cover: "FULL" }], //    36
  ["5שנים אחריות מלא", { base: 5, cover: "FULL" }],
  ["חמש שנים אחריות", { base: 5 }], //              18
  ["חמש 5 שנים אחריות", { base: 5 }], //             3  — both forms, same answer
  ["7.שנים מלא", { base: 7, cover: "FULL" }], //    15
  ["שבע 7 שנים אחריות", { base: 7 }],

  // base+extension, the densest and most common form.
  ["1+2 הרחבה", { base: 1, extra: 2 }], //          80
  ["הרחבה 1+2", { base: 1, extra: 2 }], //          65
  ["1+2בתוספת 199 שח", { base: 1, extra: 2, price: 199 }], //  55
  ["1+9 מדחס", { base: 1, extra: 9, cover: "COMPRESSOR" }], // 49
  ["1+2 מדחס", { base: 1, extra: 2, cover: "COMPRESSOR" }], // 29
  ["1+2 קירור", { base: 1, extra: 2, cover: "COOLING" }], //   23
  ["1+9 קירור", { base: 1, extra: 9, cover: "COOLING" }],
  ["199 מבצע 1+2 הרחבה", { base: 1, extra: 2, price: 199 }], // 42
  ["1+4 +199 הרחבה", { base: 1, extra: 4, price: 199 }], //     41
  ["בתוספת 149 שח 1+9", { base: 1, extra: 9, price: 149 }], //  37
  ["1+9 מדחס 149 שח", { base: 1, extra: 9, price: 149, cover: "COMPRESSOR" }], // 17
  ["1+9+שח 149 מדחס", { base: 1, extra: 9, price: 149, cover: "COMPRESSOR" }], // 15
  ["199הרחבה 1+2", { base: 1, extra: 2, price: 199 }], //      20
  ["1+2ש 199 מדחס", { base: 1, extra: 2, price: 199, cover: "COMPRESSOR" }], // 20
  ["1+2 249 שח", { base: 1, extra: 2, price: 249 }],
  ["1+2 +249 הרחבה", { base: 1, extra: 2, price: 249 }], //    11
  ["1+3  הרחבה+99", { base: 1, extra: 3, price: 99 }],
  ["1+4 מדחס 149 שח", { base: 1, extra: 4, price: 149, cover: "COMPRESSOR" }],
  ["1+9 מדחס 99 שח", { base: 1, extra: 9, price: 99, cover: "COMPRESSOR" }], // 10
  ["1+4  תשלום ביקור", { base: 1, extra: 4, cover: "VISIT" }], //  9 — "תשלום", not the importer
  ["ביקור בלבד 1+4", { base: 1, extra: 4, cover: "VISIT" }],
  ["2+8+ למדחס הרחבה", { base: 2, extra: 8, cover: "COMPRESSOR" }],
  // Two extensions on one row. The first is kept; `raw` carries the rest, and
  // the sentence never claims the nine years are full cover.
  ["1+2(שח199)+9 מדחס", { base: 1, extra: 2, price: 199, cover: "COMPRESSOR" }], // 21

  // The base spelled out, the extension in digits or words.
  ["שנה + 2 ב 199 שח", { base: 1, extra: 2, price: 199 }], //  107
  ["שנה +9 מדחס", { base: 1, extra: 9, cover: "COMPRESSOR" }], // 47
  ["שנה + 2 ביקור טכנאי 249", { base: 1, extra: 2, price: 249, cover: "VISIT" }], // 29
  ["שנה+9 שנים ב199 שח למדחס", { base: 1, extra: 9, price: 199, cover: "COMPRESSOR" }], // 23
  ["שנה + שנתיים ביקור", { base: 1, extra: 2, cover: "VISIT" }], //  22
  ["שנה + 2 ב 169שח", { base: 1, extra: 2, price: 169 }], //   19
  ["שנה + 4 ב 199 שח", { base: 1, extra: 4, price: 199 }], //  18
  ["שנה+2 ב199", { base: 1, extra: 2, price: 199 }], //        17
  ["שנה+4 שנים ב99 שח למדחס", { base: 1, extra: 4, price: 99, cover: "COMPRESSOR" }], // 16
  ["שנה + 2 ב  199 שח", { base: 1, extra: 2, price: 199 }], // 13
  ["שנה + 2 ב 149שח", { base: 1, extra: 2, price: 149 }], //   12
  ["שנה + שנתיים ב199", { base: 1, extra: 2, price: 199 }], // 12
  ["שנה + 3 ב 99 שח", { base: 1, extra: 3, price: 99 }],
  ["שנה+ 9 בתוספת 99 על המנוע", { base: 1, extra: 9, price: 99, cover: "MOTOR" }],
  ["שנה + 2 ב 149", { base: 1, extra: 2, price: 149 }],

  // A total, not an increment. Reading the 4 as an extension would promise five.
  ["אחריות ל 4 שנים בתוספת 44 שח", { base: 1, extra: 3, price: 44 }], //  9
  ["אחריות ל 5 שנים בתוספת 55 שח", { base: 1, extra: 4, price: 55 }], //  7
  ["אחריות ל 3 שנים בתוספת 33 שח", { base: 1, extra: 2, price: 33 }], //  6
];

for (const [input, want] of WARRANTY) {
  const w = parseWarranty(input);
  const got = { base: w.baseYears, extra: w.extraYears, price: w.extraPrice, cover: w.extraCoverage };
  const expect = {
    base: want.base,
    extra: want.extra ?? null,
    price: want.price ?? null,
    cover: want.cover ?? null,
  };
  if (!w.recognised) bad(`warranty "${input}" was not recognised at all`, got, expect);
  else if (JSON.stringify(got) !== JSON.stringify(expect)) bad(`warranty "${input}"`, got, expect);
}

// Who honours it. 57 rows name a company.
const PROVIDERS: [string, string, number | null][] = [
  ["שריג שנה אחריות", "שריג", 1],
  ["שריג שלוש שנים", "שריג", 3],
  ["אלקטרה שנתיים", "אלקטרה", 2],
  ["המילטון שנה אחריות", "המילטון", 1],
  ["מורפי שנתיים אחריות", "מורפי", 2],
  ["T.R שנתיים", "T.R", 2],
  ["שנתיים ט.ר", "ט.ר", 2],
  ["שנה א.ט.ד", "א.ט.ד", 1],
  ["שנה אחת א.ח.י דיגיטל", "א.ח.י דיגיטל", 1],
  ["שנה על ידי מוזר ישראל", "מוזר ישראל", 1],
  ["שנה - ראלקו", "ראלקו", 1],
  ["שנה - קונקטור", "קונקטור", 1],
  ["שלוש - ניפרו", "ניפרו", 3],
  ["שנה אחריות ע\"י ניופאן", "ניופאן", 1],
  // A company with no term. Worth keeping; there is nothing to promise.
  ["סיריוס", "סיריוס", null],
  ["גלובל סאונד", "גלובל סאונד", null],
];
for (const [input, provider, base] of PROVIDERS) {
  const w = parseWarranty(input);
  if (!w.recognised || w.provider !== provider || w.baseYears !== base) {
    bad(`provider "${input}"`, { provider: w.provider, base: w.baseYears, recognised: w.recognised }, { provider, base });
  }
}

// The column is shared. Everything here is a real value from it, and none of
// it is a warranty — a page must not print a bowl's capacity as a guarantee.
const NOT_WARRANTY = [
  "55X170X59",
  "60X172X69",
  "2200W",
  "קערה 2.1 ליטר",
  "קערה 3.9 ליטר / בלנדר 1.5 ליטר / מסחטת קשים",
  "כולל : שתי כוסות שייק  נפח 700 מ\"ל",
  "רוחב 44 גובה 33 עומק 51",
  "ניתן להכין 3 ק\"ג בצק",
  "מתאים להפרשת חלה",
  "משקל מובנה תוכניות אוטומטיות וטיימר",
  "לבן עם מוט נירוסטה",
  "מיוצר בהונגריה",
  "יצור סין",
  "עלות אחרונה 968 לדרוש זיכוי מאיתן 2 יח'",
  "בונוס על שואב אבק",
  "שרות 2146*",
  "EOB",
  "IAC",
  "EOB / IOB",
  "לבן JW",
  "ניקל JCB",
  "גימור שחור פרימיום 100 שח",
  // An availability note that wandered into the warranty column. It belongs to
  // availability.ts, and read as a warranty it would print "אזל" on the page.
  "אזל למכור מלאי ותצוגה",
  "מתחלף למקרר",
  "תצוגת",
  "2 מכורים מרצי",
];
for (const input of NOT_WARRANTY) {
  const w = parseWarranty(input);
  if (w.recognised) bad(`"${input}" must NOT be read as a warranty`, w, { recognised: false });
  if (warrantySentence(w) !== null) bad(`"${input}" produced a sentence`, warrantySentence(w), null);
}

// The sentence the page prints.
const SENTENCES: [string, string][] = [
  ["שנה + 2 ב 199 שח", "אחריות שנה. ניתן להרחיב ל-3 שנים בתוספת 199 ₪ מול הספק."],
  ["1+9 מדחס 149 שח", "אחריות שנה. ניתן להרחיב ל-10 שנים על המדחס בתוספת 149 ₪ מול הספק."],
  ["5 שנים מלא", "אחריות 5 שנים."],
  ["שריג שנה אחריות", "אחריות שנה באחריות שריג."],
  ["שנתיים", "אחריות שנתיים."],
];
for (const [input, want] of SENTENCES) {
  const got = warrantySentence(parseWarranty(input));
  if (got !== want) bad(`sentence for "${input}"`, got, want);
}

// ------------------------------------------------------------ availability --

// All 17 phrasings the three workbooks carry, with the column each was found in.
const AVAILABILITY: [Record<string, string>, string][] = [
  [{ "הערות +מבצע חג": "אזל. למכור מלאי ותצוגה" }, "STOCK_ONLY"], //  62 rows
  [{ "הערות +מבצע": "אזל -למכור מלאי ותצוגות" }, "STOCK_ONLY"], //    31
  [{ "הערות+מבצע": "אזל-למכור מלאי ותצוגות" }, "STOCK_ONLY"], //      20
  [{ "הערות+מבצעים": "אזל למכור מלאי ותצוגה" }, "STOCK_ONLY"], //      8
  [{ "הערות +מבצע": "אזל למכור מלאי ותצוגות" }, "STOCK_ONLY"], //      7
  [{ "הערות +מבצע": "אזל למכור מלאי וצוגות" }, "STOCK_ONLY"], //       4
  [{ "הערות +מבצע": "אזל למכור תצוגה" }, "STOCK_ONLY"], //             3
  [{ "הערות+מבצע": "בשלב זה אזל.. מלאי קיים מכור" }, "STOCK_ONLY"], // 1
  [{ הערות: "אזל" }, "STOCK_ONLY"], //                                 1
  [{ "תאור מוצר": "מורפי ריצארד אופה לחם דיגטלי 15 תוכניות דגם 48296 - אזל" }, "STOCK_ONLY"],
  // End of line is the stronger statement and wins on a row carrying both.
  [{ "הערות+מבצעים": "אזל סוף דגם" }, "END_OF_LINE"], //              14
  [{ המלצה: "סוף דגם" }, "END_OF_LINE"], //                           13
  [{ "הערות+מבצע": "סוף דגם יש למכור מלאי ותצוגות" }, "END_OF_LINE"], // 7
  [{ מותג: "סוף דגם" }, "END_OF_LINE"],
  [{ תאור: "סוף דגם" }, "END_OF_LINE"],
  [{ "הערות +מבצע חג": "אזל זמנית" }, "TEMPORARILY_OUT"], //          13
  [{ "הערות +מבצע חג": "אזל. זמנית" }, "TEMPORARILY_OUT"], //          1
  [{ "מס דגם": "מזגן נייד 1 כס קירור וחימום אזל זמנית" }, "TEMPORARILY_OUT"], // 1
];
for (const [row, want] of AVAILABILITY) {
  const got = sourceAvailability(row);
  if (got !== want) bad(`availability ${JSON.stringify(row)}`, got, want);
  if (sellableWithoutStock(got)) bad(`${JSON.stringify(row)} must need stock on hand`, true, false);
}

// Rows with nothing said. These are the ones the owner's new rule turns into
// ordinary sellable products, so a false marker here costs a sale.
const ORDERABLE: Record<string, string | number | null>[] = [
  { "תאור מוצר": "מקרר מקפיא תחתון 330 ליטר לבן", "טובים חדרה": 2 },
  // The row that forced the boundary on "סוף דגם": "כסוף" is a colour.
  { "מוצרי  DAVO": "ברז דיגיטלי טאצ' שחור כסוף דגם TOUCH" },
  // "תשלום" ends in the importer's name and contains no availability marker.
  { "דף מוצר": "התקנה דרך הספק בתשלום נפרד" },
  { אחריות: "1+4  תשלום ביקור" },
  { "הערות למוצר": "התקנה בבית לקוח -180שח" },
  { "הערות+מבצע": "לשדרג ל 61844" },
  { המלצה: "פרימיום" },
  { "הערות +מבצע חג": "התקנה מול השירות 120 שח +חד ותלת פאזי מינימום 16A" },
  { "מפרט טכני": "4 דלתות  דגם חדש  מהדרין מקפיא ימני מתחלף למקרר" },
  { "הערות+מבצעים": "לפתוח מקט התקנה 99 שח או הובלה והתקנה 199" },
  {},
];
for (const row of ORDERABLE) {
  const got = sourceAvailability(row);
  if (got !== "ORDERABLE") bad(`${JSON.stringify(row)} must stay ORDERABLE`, got, "ORDERABLE");
  if (!sellableWithoutStock(got)) bad(`${JSON.stringify(row)} must sell without stock`, false, true);
}

// ----------------------------------------------------------- import channel --

// The eleven brand cells that minted importer-named brands, verbatim.
const BRAND_CELLS: [string, string | null, string | null][] = [
  ["גורניה י.שלום", "גורניה", "י. שלום"],
  ["גורניה  י.שלום", "גורניה", "י. שלום"],
  ["LG י.שלום", "LG", "י. שלום"],
  ["ASKO י שלום", "ASKO", "י. שלום"],
  ["גורנייה שלום", "גורנייה", "י. שלום"],
  ["י.שלום", null, "י. שלום"],
  ["י שלום", null, "י. שלום"],
  ["י. שלום", null, "י. שלום"],
  // Ordinary brand cells keep their value and claim no importer.
  ["גורניה", "גורניה", null],
  ["BESPOKE", "BESPOKE", null],
  ["כרומקס CHS8000", "כרומקס CHS8000", null],
];
for (const [cell, brand, importer] of BRAND_CELLS) {
  const s = splitImporterFromBrand(cell);
  const want = { brand, importer, channel: importer ? "PARALLEL" : "OFFICIAL" };
  const got = { brand: s.brand, importer: s.importer, channel: s.channel };
  if (JSON.stringify(got) !== JSON.stringify(want)) bad(`brand cell "${cell}"`, got, want);
}

// The 22 Smeg rows carry the marker in a notes or variant column; their brand
// is already right and must not be touched.
const ROW_PARALLEL: Record<string, string | number | null>[] = [
  { מותג: "סמאג", הערות: "י שלום", דגם: "TSF01RD" },
  { מותג: "סמאג", תאור: "י.שלום", דגם: "KLF03PKEU" },
];
for (const row of ROW_PARALLEL) {
  const r = rowImportChannel(row);
  if (r.channel !== "PARALLEL" || r.importer !== "י. שלום") {
    bad(`row channel ${JSON.stringify(row)}`, r, { importer: "י. שלום", channel: "PARALLEL" });
  }
}

// Free text where the importer's name is a substring of another word, or a
// person's name in a contact line. None of these is a parallel import.
const ROW_OFFICIAL: Record<string, string | number | null>[] = [
  { "דף מוצר": "התקנה דרך הספק בתשלום נפרד" },
  { N27: "תשלום בבית למתקין" },
  { אחריות: "1+4  תשלום ביקור" },
  { G407: "התקנה מהדרין לכל המקררים של אלקטרה 400 שח בבית לקוח" },
  { מותג: "גורניה", "תיאור מוצר": "תנור בנוי 77 ליטר" },
];
for (const row of ROW_OFFICIAL) {
  const r = rowImportChannel(row);
  if (r.channel !== "OFFICIAL") bad(`row must stay OFFICIAL ${JSON.stringify(row)}`, r, { channel: "OFFICIAL" });
}

// -------------------------------------------------------------------- total --

const total =
  WARRANTY.length +
  PROVIDERS.length +
  NOT_WARRANTY.length +
  SENTENCES.length +
  AVAILABILITY.length +
  ORDERABLE.length +
  BRAND_CELLS.length +
  ROW_PARALLEL.length +
  ROW_OFFICIAL.length;
console.log(
  `${total - failed}/${total} passed  ` +
    `(${WARRANTY.length} warranty shapes, ${PROVIDERS.length} providers, ` +
    `${NOT_WARRANTY.length} non-warranty values, ${SENTENCES.length} sentences, ` +
    `${AVAILABILITY.length} availability markers, ${ORDERABLE.length} orderable rows, ` +
    `${BRAND_CELLS.length} brand cells, ${ROW_PARALLEL.length} parallel rows, ${ROW_OFFICIAL.length} official rows)`,
);
process.exitCode = failed > 0 ? 1 : 0;
