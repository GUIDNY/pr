// Runs parseProductContent/buildSpecRows over a fixture set of real
// products spanning many categories, and reports what came out. The point
// is not a pass/fail assertion — it is seeing that the parser degrades
// sensibly on the shapes that actually occur, including the ones with
// almost no content, rather than being tuned to one nice-looking product.
//
//   npx tsx scripts/check-product-content.ts          # summary
//   npx tsx scripts/check-product-content.ts --show   # summary + samples
import { readFileSync } from "fs";
import { parseProductContent, buildSpecRows, splitDimensions } from "../src/lib/product-content";

type Fixture = {
  sku: string; title: string; cat: string;
  description: string | null; raw: string | null;
  attrs: { label: string; value: string; unit: string | null; key: string; sortOrder: number }[];
};

const path = process.argv.find((a) => a.endsWith(".json")) ?? "scripts/product-fixtures.json";
const fixtures: Fixture[] = JSON.parse(readFileSync(path, "utf8"));
const SHOW = process.argv.includes("--show");

let noFeatures = 0, noSpecs = 0, noSummary = 0, longSummary = 0;
const rows: string[] = [];

for (const f of fixtures) {
  const content = parseProductContent(f.description, null);
  const all = buildSpecRows(
    f.attrs.map((a) => ({ value: a.value, attribute: { label: a.label, unit: a.unit, sortOrder: a.sortOrder } })),
    f.raw,
    content.specs,
  );
  const { specs, dimensions } = splitDimensions(all);

  if (content.features.length === 0) noFeatures++;
  if (specs.length === 0) noSpecs++;
  if (!content.summary) noSummary++;
  if (content.summary.length > 260) longSummary++;

  rows.push(
    `${f.sku.padEnd(9)} ${f.cat.slice(0, 18).padEnd(19)} ` +
    `feat=${String(content.features.length).padStart(2)} ` +
    `spec=${String(specs.length).padStart(2)} ` +
    `dim=${String(dimensions.length).padStart(2)} ` +
    `bul=${String(content.bullets.length).padStart(2)} prose=${String(content.prose.length).padStart(2)} ` +
    `sum=${String(content.summary.length).padStart(3)}`,
  );

  if (SHOW && (content.features.length > 0 || content.specs.length > 0)) {
    console.log("\n" + "=".repeat(70));
    console.log(`${f.sku} · ${f.title.slice(0, 55)} · ${f.cat}`);
    console.log("SUMMARY :", content.summary.slice(0, 150));
    for (const ft of content.features.slice(0, 3)) console.log(`FEATURE : ${ft.title}  ->  ${ft.body.slice(0, 70)}`);
    for (const s of content.specs.slice(0, 5)) console.log(`SPEC    : ${s.label} = ${s.value}`);
  }
}

console.log("\n" + rows.join("\n"));
console.log("\n" + "-".repeat(50));
console.log(`products                    ${fixtures.length}`);
console.log(`  no features extracted     ${noFeatures}`);
console.log(`  no spec rows at all       ${noSpecs}`);
console.log(`  no summary                ${noSummary}`);
console.log(`  summary over 260 chars    ${longSummary}   <- must be 0`);
