// Which stock column counts as stock this shop can sell.
//
// מחירון ליין קטן carries NINE stock columns. Four are warehouses —
// "מלאי חדרה", "טובים חדרה", "מלאי LUXRY", "טובים" — five are display
// units ("תצוגה חדרה", "תצוגות LUXERY", "תצוגת לקצ'ורי", …), and a
// "יתרה" column runs a total over the lot. Summing them, which is what
// totalStock does for every other workbook, answers "does this exist
// somewhere in the company". That is not the same question as "can this
// shop sell it".
//
// The owner's instruction on 1 November, given twice and narrowly:
// "רק מה שיש לו מספר במלאי חדרה". Not the Hedera branch broadly — that
// one column. A display unit standing in Hedera does not count, and
// neither does a LUXERY warehouse.
//
// THE TRAP THIS FILE EXISTS FOR is the "יתרה" column. It is a running
// total over every warehouse and display stand on the row, so a
// totalStock that keeps its usual short-circuit would read 4 for a row
// holding nothing in Hedera at all — quietly re-admitting every location
// the rule just excluded, and looking like it worked.
//
// Run: npx tsx scripts/check-hedera-stock.ts
import { totalStock } from "../src/lib/inventory/diff-engine";
import type { ClassifiedField } from "../src/lib/inventory/types";
import { sellableStockColumnsFor, stockLineCounts } from "../src/lib/inventory/availability";

let failed = 0;
let checked = 0;
const fail = (m: string) => {
  console.log(`FAIL  ${m}`);
  failed++;
};
const expect = (label: string, actual: unknown, wanted: unknown) => {
  checked++;
  if (actual !== wanted) fail(`${label}: got ${String(actual)}, wanted ${String(wanted)}`);
};

const line = (label: string, quantity: number, field: ClassifiedField = "WAREHOUSE_STOCK") => ({ label, field, quantity });
const HEDERA = sellableStockColumnsFor("small-appliances");

/* ── which workbooks have a rule at all ──────────────────────────────── */
expect("ליין קטן counts one column", JSON.stringify(HEDERA), JSON.stringify(["מלאי חדרה"]));
expect("the white-goods workbook was not asked about", sellableStockColumnsFor("white-goods-screens"), null);
expect("nor was electronics", sellableStockColumnsFor("electronics"), null);
expect("a record with no source counts everything", sellableStockColumnsFor(null), null);

/* ── the nine real columns, each judged ──────────────────────────────── */
const COUNTS: [string, boolean][] = [
  ["מלאי חדרה", true],
  ["טובים חדרה", false],   // a Hedera warehouse, but not the column named
  ["תצוגה חדרה", false],   // a display unit in Hedera
  ["מלאי LUXRY", false],
  ["טובים", false],
  ["תצוגות LUXERY", false],
  ["תצוגת לקצ'ורי", false],
  ["תצוגה לקצ'ורי", false],
  ["תצוגה", false],
  ["יתרה", false],
];
for (const [label, wanted] of COUNTS) expect(`"${label}" counts`, stockLineCounts(label, HEDERA), wanted);

/* The sheets write the header with a trailing space in some tabs and not
   others. A rule that depended on which is a rule nobody could keep. */
expect('"מלאי חדרה " with a trailing space is the same column', stockLineCounts("מלאי חדרה ", HEDERA), true);
expect("…and with a leading one", stockLineCounts(" מלאי חדרה", HEDERA), true);

/* ── the sum ─────────────────────────────────────────────────────────── */
expect(
  "three in Hedera is three",
  totalStock({ stockLines: [line("מלאי חדרה", 3)] }, HEDERA),
  3,
);
expect(
  "one in LUXERY is nothing we can sell",
  totalStock({ stockLines: [line("מלאי LUXRY", 1)] }, HEDERA),
  0,
);
expect(
  "a display unit in Hedera is nothing either",
  totalStock({ stockLines: [line("תצוגה חדרה", 1, "SHOWROOM_STOCK")] }, HEDERA),
  0,
);
expect(
  "only the Hedera column is added up",
  totalStock(
    { stockLines: [line("מלאי חדרה", 2), line("מלאי LUXRY", 5), line("תצוגה חדרה", 1, "SHOWROOM_STOCK")] },
    HEDERA,
  ),
  2,
);

/* THE TRAP. "יתרה" totals every location on the row. Honouring its
   short-circuit here would report 9 for a row with nothing in Hedera. */
expect(
  "the יתרה running total does NOT override the rule",
  totalStock(
    { stockLines: [line("יתרה", 9, "SELLABLE_STOCK"), line("מלאי LUXRY", 9)] },
    HEDERA,
  ),
  0,
);
expect(
  "…and it does not inflate a row that does have Hedera stock",
  totalStock(
    { stockLines: [line("יתרה", 9, "SELLABLE_STOCK"), line("מלאי חדרה", 2), line("מלאי LUXRY", 7)] },
    HEDERA,
  ),
  2,
);

/* ── every other workbook is untouched ───────────────────────────────── */
expect(
  "with no rule, every column still sums as before",
  totalStock({ stockLines: [line("מלאי חדרה", 2), line("מלאי LUXRY", 5)] }, null),
  7,
);
expect(
  "…and יתרה still short-circuits there, which is why it is trusted",
  totalStock({ stockLines: [line("יתרה", 4, "SELLABLE_STOCK"), line("מלאי", 2), line("תצוגה", 1, "SHOWROOM_STOCK")] }, null),
  4,
);
expect(
  "an absent argument behaves exactly like null",
  totalStock({ stockLines: [line("מלאי חדרה", 2), line("מלאי LUXRY", 5)] }),
  7,
);
expect("no stock lines at all", totalStock({ stockLines: [] }, HEDERA), 0);
expect("a negative never becomes a negative stock", totalStock({ stockLines: [line("מלאי חדרה", -3)] }, HEDERA), 0);

console.log(
  `${checked - failed}/${checked} passed  (ליין קטן sells from "מלאי חדרה" alone; ` +
    `the other eight columns and the יתרה total do not re-admit it, and the ` +
    `other workbooks count every column as before)`,
);
process.exit(failed === 0 ? 0 : 1);
