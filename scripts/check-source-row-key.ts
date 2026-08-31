// The properties sourceRowKey has to hold, stated as tests.
//
// The key is what stops a shifted sheet from duplicating a product we have
// already curated, so what matters is not that it hashes something — it is
// exactly which changes move it and which do not.
//
//   npm run check:rowkeys
import { sourceRowKeyFor } from "../src/lib/inventory/source-row-key";
import type { NormalizedProductRow } from "../src/lib/inventory/types";

let failed = 0;
const fail = (msg: string) => {
  console.log(`FAIL  ${msg}`);
  failed++;
};
let passed = 0;
const ok = () => passed++;

function row(over: Partial<NormalizedProductRow> = {}): NormalizedProductRow {
  return {
    sourceKey: "electronics",
    sheetName: "מקררים",
    rowIndex: 41,
    categorySlug: "refrigeration",
    sku: "",
    skuIsSynthetic: true,
    model: "RT62K7044BS",
    brandName: "סמסונג",
    title: "סמסונג RT62K7044BS",
    color: null,
    warranty: null,
    imageUrl: null,
    retailPrice: 5990,
    minSalePrice: 5490,
    managerPrice: null,
    internalCost: 4200,
    stockLines: [{ label: "מחסן", field: "WAREHOUSE_STOCK", quantity: 4 }],
    rawSnapshot: {},
    issues: [],
    ...over,
  };
}

const base = sourceRowKeyFor(row());

// --- the key exists at all, and only where it is needed ------------------
if (!base) fail("a temp-SKU row with brand, model and title gets a key");
else ok();

if (sourceRowKeyFor(row({ skuIsSynthetic: false, sku: "120813" })) !== null)
  fail("a row with a real SKU needs no key — the SKU is the identity");
else ok();

if (sourceRowKeyFor(row({ brandName: null, model: null, title: "" })) !== null)
  fail("a row with nothing to key on returns null rather than a shared hash");
else ok();

// --- what must NOT move the key -----------------------------------------
// These are the fields a new sheet changes on purpose, and the fields we
// change in the admin. If any of them moved the key, the key would identify
// nothing and the duplicate it exists to prevent would come back.
const stable: [string, Partial<NormalizedProductRow>][] = [
  ["the price changed", { minSalePrice: 4990, retailPrice: 5490 }],
  ["the supplier cost changed", { internalCost: 3900 }],
  ["stock moved", { stockLines: [{ label: "מחסן", field: "WAREHOUSE_STOCK", quantity: 0 }] }],
  ["the row moved down the sheet", { rowIndex: 77 }],
  ["the image url changed", { imageUrl: "https://example.com/a.jpg" }],
  ["the colour column was filled in", { color: "נירוסטה" }],
  ["the row picked up an issue", { issues: [{ type: "MISSING_MODEL", message: "x" }] }],
  ["the sheet was re-exported with padding", { title: "  סמסונג   RT62K7044BS " }],
  ["the sheet was re-exported in other case", { model: "rt62k7044bs" }],
  ['גרש/מרכאות were typed differently', { title: 'סמסונג "RT62K7044BS"', }],
];
for (const [why, over] of stable) {
  if (sourceRowKeyFor(row(over)) !== base) fail(`key must not move when ${why}`);
  else ok();
}
// The same, said about the product rather than the row: nothing we do in the
// admin reaches this function at all, because it only ever reads the sheet.

// --- what MUST move the key ---------------------------------------------
const distinct: [string, Partial<NormalizedProductRow>][] = [
  ["a different model on the line", { model: "RT62K7057SL" }],
  ["a different brand on the line", { brandName: "הייסנס" }],
  ["a genuinely different product name", { title: "סמסונג RF85 4 דלתות" }],
  ["the same model listed under another tab", { sheetName: "מקפיאים" }],
  ["the same model in another supplier's file", { sourceKey: "coffee-machines-sheet" }],
];
for (const [why, over] of distinct) {
  if (sourceRowKeyFor(row(over)) === base) fail(`key must move for ${why}`);
  else ok();
}

// --- shape ---------------------------------------------------------------
if (!/^[0-9a-f]{32}$/.test(base ?? "")) fail("key is 32 hex chars, so it fits a plain text column and reads in a CSV");
else ok();

console.log(`${passed}/${passed + failed} checks passed`);
process.exitCode = failed > 0 ? 1 : 0;
