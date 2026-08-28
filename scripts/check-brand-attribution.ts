// Regression check for brand attribution in the Excel import.
//
// The bug this exists for: currentBrand in excel-parser.ts was set by a
// yellow-highlighted BRAND cell and then never cleared, while the normalizer
// let that inherited value outrank the row's own BRAND cell. Real sheets stop
// colouring block headers partway down, so every row after that point was
// stamped with a brand from an arbitrary distance above it — Bauknecht and
// TCL fridges under AEG, Bosch under Beko, Gorenje under Imperial. Correcting
// it in the database never held, because the next sync re-derived it.
//
// Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/check-brand-attribution.ts
import * as XLSX from "xlsx";
import { parseSheetRows } from "../src/lib/inventory/excel-parser";
import { normalizeRow } from "../src/lib/inventory/normalizer";

const YELLOW = { s: { fgColor: { rgb: "FFFF00" } } };
const HEADER = ["מק\"ט", "מותג", "תאור מוצר", "דגם", "מחיר", "יתרה"];

type Cellspec = { yellow?: boolean };
type Case = {
  name: string;
  rows: unknown[][];
  style: Record<string, Cellspec>; // "r,c" -> spec
  expect: (string | null)[];
};

const cases: Case[] = [
  {
    name: "a highlighted block header still fills the blank rows under it",
    rows: [
      HEADER,
      ["0279", "AEG", "AEG כיריים אינדוקציה", "NI064B00FB", 3990, 4],
      ["0281", "", "AEG משולב גז 90 סמ", "HDB95623", 4990, 2],
    ],
    style: { "1,1": { yellow: true } },
    expect: ["AEG", "AEG"],
  },
  {
    name: "an uncoloured block header ends the previous block",
    rows: [
      HEADER,
      ["0279", "AEG", "AEG כיריים אינדוקציה", "NI064B00FB", 3990, 4],
      ["100963", "באוכנכט", "באוכנכט KFN96APEAL מהדרין", "KFN96APEAL", 8990, 1],
      ["103863", "", "באוכנכט KGN86AIDR", "KGN86AIDR", 7990, 3],
      ["100572", "TCL", "TCL CBNSFC572I", "CBNSFC572I", 5990, 2],
    ],
    style: { "1,1": { yellow: true } },
    expect: ["AEG", "באוכנכט", "באוכנכט", "TCL"],
  },
  {
    name: "junk in the brand column neither wins nor propagates",
    rows: [
      HEADER,
      ["0279", "AEG", "AEG כיריים אינדוקציה", "NI064B00FB", 3990, 4],
      ["0290", "15//1", "AEG תנור בנוי", "BPS6737", 4990, 2],
      ["0291", "", "AEG מדיח כלים", "SMV4HAX", 3490, 1],
    ],
    style: { "1,1": { yellow: true } },
    expect: ["AEG", "AEG", "AEG"],
  },
  {
    name: "a section divider closes the brand block above it",
    rows: [
      HEADER,
      ["0279", "AEG", "AEG כיריים אינדוקציה", "NI064B00FB", 3990, 4],
      ["", "", "מקררים", "", "", ""],
      ["100546", "", "TCL P540BFN", "P540BFN", 4990, 3],
    ],
    style: { "1,1": { yellow: true }, "2,2": { yellow: true } },
    expect: ["AEG", "TCL"],
  },
  {
    // Regression guard for the fix above: letting the row's own BRAND cell
    // win is only safe while junk in that cell is still rejected. These
    // values are real — they were sitting in the brand column in production,
    // and each is a category label or a pack count, not a manufacturer.
    name: "a category label in the brand column is not a brand",
    rows: [
      HEADER,
      ["0279", "AEG", "AEG כיריים אינדוקציה", "NI064B00FB", 3990, 4],
      ["840967", "בלנדר מוט", "גרץ בלנדר מוט 300W דגם GR967", "GR967", 199, 6],
      ["830653", "מעבדי מזון", "NINJA מעבד מזון 850W דגם BN653", "BN653", 899, 2],
    ],
    style: { "1,1": { yellow: true } },
    expect: ["AEG", "AEG", "AEG"],
  },
  {
    name: "a leading pack count in the brand column is not a brand",
    rows: [
      HEADER,
      ["0275", "HGB", "5 גז רשתות ברזל יצוק", "HGB75820SM", 2990, 3],
      ["0277", "5 גז רשתות", "5 גז רשתות ברזל יצוק + ווק", "HKB75341NB", 3190, 2],
      ["700313", "3i", "3i שואב שוטף רובוטי", "S10 Ultra", 4990, 1],
    ],
    style: { "1,1": { yellow: true } },
    expect: ["HGB", "HGB", "3i"],
  },
];

function build(c: Case) {
  const sheet: XLSX.WorkSheet = {};
  c.rows.forEach((row, r) =>
    row.forEach((v, col) => {
      if (v === "" || v === null || v === undefined) return;
      const ref = XLSX.utils.encode_cell({ r, c: col });
      sheet[ref] = {
        v,
        t: typeof v === "number" ? "n" : "s",
        ...(c.style[`${r},${col}`]?.yellow ? YELLOW : {}),
      };
    }),
  );
  sheet["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: c.rows.length - 1, c: HEADER.length - 1 },
  });
  return sheet;
}

let failed = 0;
for (const c of cases) {
  const parsed = parseSheetRows("מקררים", c.rows, build(c));
  if (!parsed) {
    console.log(`FAIL  ${c.name}\n      header row not detected`);
    failed++;
    continue;
  }
  const got = parsed.rows.map(
    (r) => normalizeRow("PREC", parsed.sheetName, r, parsed.columns).brandName,
  );
  const ok = got.length === c.expect.length && got.every((g, i) => g === c.expect[i]);
  if (ok) {
    console.log(`ok    ${c.name}`);
  } else {
    failed++;
    console.log(`FAIL  ${c.name}`);
    console.log(`      expected ${JSON.stringify(c.expect)}`);
    console.log(`      got      ${JSON.stringify(got)}`);
  }
}

console.log(`\n${cases.length - failed}/${cases.length} passed`);
process.exit(failed === 0 ? 0 : 1);
