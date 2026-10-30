// What a product is remembered by, so it survives the supplier moving it.
//
// THE FOUNDING CASE, and it is the whole reason this file exists.
//
// The Bosch SMS4ECW28E arrived in August on a row carrying SKU 140201. The
// rule then was "only remember SKU-less rows — a row with a SKU has a real
// identity and does not need a remembered one", so nothing about it was
// written down.
//
// By October the supplier had re-sorted מדיחים AND dropped the SKU from
// that row. The Bosch was now a SKU-less row at position 64; its old
// position 72 had become an SMV 2HTX06E. Everything that could have
// recognised it was gone at once:
//
//   the SKU       → blank, the supplier stopped printing it
//   the position  → row 72 is a different machine now
//   the name      → never written down, because the row once had a SKU
//
// So the sync created a second product. Two Bosch dishwashers on the site,
// 3,990 and 2,790, and a customer bought the cheap one: a 3,680 ₪ machine
// sold for 2,790 with the order page reporting a 440 ₪ profit.
//
// A row that has a SKU today may not have one tomorrow. That is the single
// assumption that failed, and the assertion below is the one that holds
// the fix in place.
//
// Run: npx tsx scripts/check-row-aliases.ts
import {
  MIN_ALIAS_MODEL_LENGTH,
  aliasEntriesFor,
  aliasValue,
} from "../src/lib/inventory/row-aliases";

let failed = 0;
let checked = 0;
const fail = (message: string) => {
  console.log(`FAIL  ${message}`);
  failed++;
};
const expect = (label: string, actual: unknown, wanted: unknown) => {
  checked++;
  if (actual !== wanted) fail(`${label}: got ${String(actual)}, wanted ${String(wanted)}`);
};

const kinds = (entries: { kind: string; value: string }[]) => entries.map((e) => e.kind).join(",");
const modelOf = (entries: { kind: string; value: string }[]) =>
  entries.find((e) => e.kind === "MODEL")?.value ?? null;

/* ── the founding case ──────────────────────────────────────────────── */
/* The August row: it HAS a SKU, and it must still be remembered. Before
   the fix the function returned nothing at all here, and that nothing is
   what cost 890 ₪ in October. */
const august = aliasEntriesFor(
  { model: "SMS4ECW28E", rowKey: "21bf2ba04607db70d3faaf6098910440" },
  { modelIsAmbiguous: false },
);
expect("a row WITH a SKU is remembered too", kinds(august), "MODEL,ROWKEY");
expect("…under the manufacturer's code", modelOf(august), "SMS4ECW28E");

/* The October row: same machine, no SKU, re-sorted, and the supplier has
   put a space in the model. It must resolve to the same remembered name,
   or the alias is no use for the one job it has. */
const october = aliasEntriesFor(
  { model: "SMS 4ECW28E", rowKey: "a-different-hash-the-text-changed" },
  { modelIsAmbiguous: false },
);
expect("the re-sorted row asks for the same name", modelOf(october), modelOf(august));
expect("…even though its row hash moved on", october[1]?.value !== august[1]?.value, true);

/* ── the shapes the suppliers really send ───────────────────────────── */
const SAME: [string, string][] = [
  ["SMS 4ECW28E", "SMS4ECW28E"],
  ["sms4ecw28e", "SMS4ECW28E"],
  ["SMS-4ECW28E", "SMS4ECW28E"],
  ["  SMS 4ECW28E  ", "SMS4ECW28E"],
  ["H 7260 BP", "H7260BP"],
  ["SJ-3850WH", "SJ3850WH"],
];
for (const [raw, wanted] of SAME) expect(`aliasValue(${JSON.stringify(raw)})`, aliasValue(raw), wanted);
/* Hebrew survives: some rows name the product only in Hebrew, and that
   text is the one thing on them that does not move. */
expect("Hebrew is kept", aliasValue("מקרר שארפ"), "מקררשארפ");
expect("nothing", aliasValue(null), "");
expect("punctuation only", aliasValue("---"), "");

/* ── the model floor ────────────────────────────────────────────────── */
expect(
  `a model under ${MIN_ALIAS_MODEL_LENGTH} characters is not a name`,
  modelOf(aliasEntriesFor({ model: "750", rowKey: "k" }, { modelIsAmbiguous: false })),
  null,
);
expect(
  "exactly the floor is",
  modelOf(aliasEntriesFor({ model: "NF417", rowKey: "k" }, { modelIsAmbiguous: false })),
  "NF417",
);
expect(
  "…and the row hash is still remembered without it",
  kinds(aliasEntriesFor({ model: "750", rowKey: "k" }, { modelIsAmbiguous: false })),
  "ROWKEY",
);

/* ── an ambiguous name is dropped, not contested ────────────────────── */
/* Ten model strings in this catalogue are worn by two products each. The
   unique index would stop the second taking the name, so the first would
   keep it and answer for the second's row for ever — worse than nobody
   holding it. */
const contested = aliasEntriesFor(
  { model: "PUE611BB5Y", rowKey: "hash" },
  { modelIsAmbiguous: true },
);
expect("an ambiguous model is not written", modelOf(contested), null);
expect("but its row hash still is — a whole row does not repeat", kinds(contested), "ROWKEY");

/* ── nothing to remember ────────────────────────────────────────────── */
expect("no model and no hash", aliasEntriesFor({ model: null, rowKey: null }, { modelIsAmbiguous: false }).length, 0);
expect(
  "a model but no hash",
  kinds(aliasEntriesFor({ model: "SMS4ECW28E", rowKey: null }, { modelIsAmbiguous: false })),
  "MODEL",
);
expect(
  "an empty model string",
  aliasEntriesFor({ model: "", rowKey: null }, { modelIsAmbiguous: false }).length,
  0,
);

/* The hash comes second, always: it is the narrower claim and the lookup
   tries it first, so the order here is the order it is read in. */
const both = aliasEntriesFor({ model: "SMS4ECW28E", rowKey: "hash" }, { modelIsAmbiguous: false });
expect("model then rowkey", kinds(both), "MODEL,ROWKEY");

console.log(
  `${checked - failed}/${checked} passed  (a row with a SKU is remembered; ` +
    `the same machine re-sorted and un-SKU'd still asks for its own name)`,
);
process.exit(failed === 0 ? 0 : 1);
