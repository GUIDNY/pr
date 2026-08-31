// cleanBrandCell and brandFromTitle, held to values taken out of the live
// catalog rather than invented. Both were written to repair brand rows that
// are not brand names, and the expensive failure mode is the opposite one:
// a guard that also rejects a real manufacturer would quietly file good
// products under "לא ידוע".
//
//   npm run check:brand-cleanup
import { cleanBrandCell, brandFromTitle } from "../src/lib/inventory/brand-extractor";

let failed = 0;
let passed = 0;
const fail = (msg: string) => { console.log(`FAIL  ${msg}`); failed++; };
const ok = () => passed++;
const eq = (got: string | null, want: string | null, why: string) =>
  got === want ? ok() : fail(`${why}\n        got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// --- brand rows in the catalog today that are not brand names ------------
const JUNK: [string, string | null, string][] = [
  ["DS82", null, "a model code alone has no brand inside it"],
  ["R8SW", null, "same"],
  ["PRO16RW", null, "same"],
  ["R120SWI", null, "same"],
  ["כרומקס CHS8000", "כרומקס", "a real brand with its model stuck on the end keeps the brand"],
  ["לקסוס 3 מ'", "לקסוס", "a size does not make a second manufacturer"],
  ["לקסוס 1 מ'", "לקסוס", "same — these two split one brand four ways"],
  ["לקסוס 2 מדפים", "לקסוס", "same"],
  ["סט 5.1", null, "a set with a channel count is not a maker"],
  ["5 גז רשתות", null, "a burner count written where a name belongs"],
  ["3 סלסלאות דיגיטלי 15", null, "same"],
  ["3סלסלאות דיגיטלי 15", null, "same, with the space missing — a digit against a Hebrew letter is always a count"],
  ["גורניה  י.שלום", "גורניה י.שלום", "double spacing is normalised; the caller then merges it into גורניה"],
  ["6 תכ חצי כמות דיגיטלי 14", null, "same"],
  ["מיקסר אומנים 10 ערוצים", null, "a product description"],
  ["מצנמים", null, "a category label — this class filed 68 products once"],
  ["מיקסרים", null, "same"],
  ["אינדוקציה", null, "same"],
  ["מעבדי מזון", null, "same"],
  ["בלנדר מוט", null, "product type all the way through, nothing to keep"],
  ["מיקסר יד", null, "same"],
  ["קאסו משקל", "קאסו", "a real brand with the thing it sells appended"],
  ["אומגה משקל", "אומגה", "same"],
];
for (const [input, want, why] of JUNK) eq(cleanBrandCell(input), want, `${why}: ${JSON.stringify(input)}`);

// --- real manufacturers, which must survive untouched --------------------
// Taken from the live catalog's own brand list, including the awkward ones:
// two-character names, names carrying a geresh, names that are Latin and
// Hebrew at once.
const REAL = [
  "LG", "EAZO", "גטפויינט", "נורמנדה", "שטארק", "SOL", "ברטזוני", "בלומברג", "סאוטר", "מידאה",
  "בקו", "סמסונג", "אימפריאל", "זנוסי", "לקסוס", "HAMA", "כרומקס", "נקסט", "מטריקס", "3M", "3i",
  "מורפי ריצ'ארד", "גאג'יה", "המילטון ביץ'", "ריצ'טק", "קיצ'נשיף", "פיור אקוסטיק", "B&W", "AEG",
];
for (const name of REAL) eq(cleanBrandCell(name), name, `a real manufacturer must come back unchanged`);

// --- brandFromTitle: only ever a name the catalog already uses -----------
const VOCAB = ["לקסוס", "HAMA", "פיור", "פיור אקוסטיק", "כרומקס", "נקסט", "בקו", "LG", "סמסונג", "DS"];
const TITLES: [string, string | null, string][] = [
  ["לקסוס 1.5 מ' 3RCA ל 3RCA פשוט", "לקסוס", "the manufacturer opens the title"],
  ["כבל אופטי 1.5 מ' HAMA דגם 42927", "HAMA", "it sits in the middle"],
  ["זוג מיקרופונים אלחוטיים פיור אקוסטיק", "פיור אקוסטיק", "the longer name wins over the shorter one it contains"],
  ["כבל 21 ל 21 IN/OUT", null, "a cable that names nobody stays unnamed"],
  ["קולט ארובה 90 שחור", null, "so does an extractor hood described only by its size"],
  ["C1B", null, "a bare code is not a brand"],
  ["מקרר בקורת איכות מיוחדת", null, "בקו must not match inside בקורת — \\b never fires between two Hebrew letters"],
  ["טלוויזיה LG OLED 65", "LG", "a two-letter Latin brand is still found"],
  ["מסך LGB-500 של יצרן אחר", null, "and not inside a longer token"],
  ['DS82-BK סאב וופר אקטיבי דגם ELAC', null, "a brand must not match where a digit follows it — DS at the front of DS82"],
  ["כבל מאריך PL ל - PL", null, "PL is a connector printed in cable names; the caller keeps it out of the vocabulary"],
];
for (const [title, want, why] of TITLES) eq(brandFromTitle(title, VOCAB), want, `${why}: ${JSON.stringify(title)}`);

// Nothing is ever invented: a manufacturer the catalog does not know stays
// unfound, however plainly the title names it.
eq(brandFromTitle("DS82-BK סאב וופר אקטיבי דגם ELAC", VOCAB), null, "a brand absent from the vocabulary is never created out of the title");

console.log(`${passed}/${passed + failed} checks passed`);
process.exitCode = failed > 0 ? 1 : 0;
