// What the importer will believe as a supplier SKU — see plausibleSku in
// lib/inventory/normalizer.ts.
//
// Run: npx tsx scripts/check-sku-cell.ts
import { plausibleSku } from "../src/lib/inventory/normalizer";

const CASES: [name: string, cell: string | null, expected: string | null][] = [
  // What real SKUs look like in the catalogue.
  ["all digits", "207593", "207593"],
  ["leading zero", "0862", "0862"],
  ["a letter and digits", "O151251", "O151251"],
  ["surrounding spaces", "  101058 ", "101058"],
  ["a dash", "TEST-PAY-001", "TEST-PAY-001"],
  // What the supplier has typed into the column instead, all found live.
  ["a semicolon", ";", null],
  ["two semicolons", ";;", null],
  ["the word 'new'", "חדש", null],
  ["a service note with phone numbers", "אינדסיט -אבי שפילמן ניופאן--0524422785   לי- 0508779987", null],
  // And the shapes that would come next.
  ["letters only", "NINJA", null],
  ["a dash alone", "-", null],
  ["a space inside", "207 593", null],
  ["empty", "", null],
  ["missing", null, null],
  ["far too long", "1".repeat(31), null],
];

let failed = 0;
for (const [name, cell, expected] of CASES) {
  const got = plausibleSku(cell);
  if (got !== expected) {
    failed++;
    console.error(`FAIL  ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`);
  }
}
console.log(`${CASES.length - failed}/${CASES.length} passed`);
if (failed) process.exit(1);
