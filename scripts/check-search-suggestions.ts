// The search box is the first thing most visitors touch, and the one place
// a thrown error replaces the whole dropdown with nothing.
//
// Run: npx tsx scripts/check-search-suggestions.ts
import { splitOnMatches } from "../src/lib/search-highlight";

let failed = 0;
const fail = (message: string) => {
  console.log(`FAIL  ${message}`);
  failed++;
};

/** The title must survive the split exactly — nothing dropped, nothing added. */
const TITLES = [
  ["מקרר משרדי HOMEX 48 ליטר", "מקרר"],
  ["מקרר משרדי Stark מקרר קובי", "מקרר"],
  ["מקרר מקפיא תחתון ליבהר Liebherr CNSFD5743", "ליבהר"],
  ["מכונת כביסה 8 ק\"ג", "כביסה"],
  ["Bosch KGN39VLEB", "bosch"],
  ["תנור בנוי פירוליטי", ""],
  ["קולט אדים Elica TAMAYA", "   "],
];
for (const [title, query] of TITLES) {
  const parts = splitOnMatches(title, query);
  const rebuilt = parts.map((p) => p.text).join("");
  if (rebuilt !== title) fail(`the title did not survive: ${JSON.stringify(title)} became ${JSON.stringify(rebuilt)}`);
  if (parts.some((p) => p.text === "")) fail(`an empty segment was emitted for ${JSON.stringify(title)}`);
}

/* A query is user input before it is a pattern. Every one of these threw
   with an unescaped RegExp, which blanks the dropdown mid-keystroke. */
const HOSTILE = ["מקרר (", "a)b", "[", "*", "+", "?", "\\\\", "a|b", "^$", "{2,}", "(?<"];
for (const query of HOSTILE) {
  try {
    const parts = splitOnMatches("מקרר משרדי Stark", query);
    if (parts.map((p) => p.text).join("") !== "מקרר משרדי Stark") fail(`hostile query mangled the title: ${JSON.stringify(query)}`);
  } catch (error) {
    fail(`a query threw instead of matching nothing: ${JSON.stringify(query)} — ${String(error)}`);
  }
}

/* What the highlight is for: the part that differs, not the part they share. */
const marked = (title: string, query: string) =>
  splitOnMatches(title, query).filter((p) => p.match).map((p) => p.text);

if (marked("מקרר משרדי HOMEX", "מקרר").length !== 1) fail("the matched word is not marked once");
if (marked("מקרר משרדי Stark", "Stark")[0] !== "Stark") fail("a Latin brand is not matched");
if (marked("מקרר משרדי STARK", "stark")[0] !== "STARK") fail("matching is not case-insensitive");
if (marked("מקרר משרדי", "מקרר משרדי").length !== 2) fail("a two-word query marks only one word");
// A single character matches most of a Hebrew title; marking all of it
// marks nothing, so short terms are dropped rather than highlighted.
if (marked("מקרר משרדי", "מ").length !== 0) fail("a one-character term should not highlight");
if (marked("מקרר משרדי", "").length !== 0) fail("an empty query should not highlight");

const total = TITLES.length + HOSTILE.length + 6;
console.log(`${total - failed}/${total} passed  (${TITLES.length} titles intact, ${HOSTILE.length} hostile queries survived, 6 highlight rules)`);
process.exit(failed === 0 ? 0 : 1);
