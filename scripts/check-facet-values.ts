/**
 * The facet normaliser, against the values actually in this catalogue.
 *
 * Every case below was read out of the live database, not imagined: washing
 * machine capacity stored four ways, width with two different Hebrew geresh
 * characters, noise with the unit glued on, and "לא צוין" sitting in a
 * numeric column. The point of the check is that one chip appears per real
 * answer — because a chip that covers half its products silently sells the
 * shop short, and "not specified" is not something to offer a shopper.
 *
 * No database needed: it is a pure function and this is a pure test.
 */
import { normalizeFacetValue } from "../src/lib/facet-value";

type Case = { raw: string; expect: string | null; why: string };

const CASES: Case[] = [
  // Capacity — the case that started this
  { raw: "8", expect: "8", why: "plain number" },
  { raw: '8 ק"ג', expect: "8", why: "unit stripped, folds into the plain number" },
  { raw: "8 ק״ג", expect: "8", why: "same but with the Hebrew geresh" },
  { raw: "8.0", expect: "8", why: "trailing zero is the same measurement" },
  { raw: "08", expect: "8", why: "leading zero is the same number" },

  // Width — three spellings of one width
  { raw: "60 ס״מ", expect: "60", why: "geresh form" },
  { raw: '60 ס"מ', expect: "60", why: "ASCII quote form" },
  { raw: "60", expect: "60", why: "bare" },
  { raw: "59.8 ס״מ", expect: "59.8", why: "a different width stays different" },

  // Noise
  { raw: "72", expect: "72", why: "bare" },
  { raw: "75dB", expect: "75", why: "unit with no space" },
  { raw: "78 dB", expect: "78", why: "unit with a space" },
  { raw: "79 dBA", expect: "79", why: "dBA before dB, longest match first" },

  // Placeholders must never be offered
  { raw: "לא צוין", expect: null, why: "not a choice" },
  { raw: "לא רלוונטי", expect: null, why: "not a choice" },
  { raw: "-", expect: null, why: "not a choice" },
  { raw: "   ", expect: null, why: "blank" },

  // Words must survive untouched
  { raw: "חזית", expect: "חזית", why: "a real value" },
  { raw: "נירוסטה", expect: "נירוסטה", why: "a real value" },
  { raw: "  A++  ", expect: "A++", why: "trimmed, not mangled" },
  { raw: "55 אינץ'", expect: "55", why: "inches" },
  // A word ending in a unit-like letter must not be truncated
  { raw: "לבן", expect: "לבן", why: "ends in ן, not a unit" },
  { raw: "שחור", expect: "שחור", why: "untouched" },
];

let failed = 0;
for (const c of CASES) {
  const got = normalizeFacetValue(c.raw);
  const ok = got === c.expect;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${JSON.stringify(c.raw).padEnd(16)} -> ${JSON.stringify(got).padEnd(12)} ${ok ? "" : `expected ${JSON.stringify(c.expect)}`}  (${c.why})`);
}

// And the whole point: the four capacity spellings must collapse to one chip.
const capacities = ["8", '8 ק"ג', "8 ק״ג", "8.0"].map(normalizeFacetValue);
const distinct = new Set(capacities);
if (distinct.size !== 1) {
  failed++;
  console.log(`FAIL  four spellings of 8kg produced ${distinct.size} chips: ${[...distinct].join(", ")}`);
} else {
  console.log(`ok    four spellings of 8kg collapse to one chip: "${[...distinct][0]}"`);
}

console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
