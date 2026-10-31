// READ ONLY. Parses the three workbooks with the PROJECT'S OWN parser and
// normaliser, so the scan sees exactly what a sync run sees.
import { readFileSync, readdirSync, writeFileSync } from "fs";
import { parseWorkbook } from "@/lib/inventory/excel-parser";
import { normalizeRow } from "@/lib/inventory/normalizer";
import { resolvedPrice } from "@/lib/inventory/diff-engine";
import { categoryForSheet, isProductSheet, type SourceKey } from "@/lib/inventory/sheet-map";

const dir = process.env.SHEETDIR!;
const files = readdirSync(dir).filter((f) => f.endsWith(".xlsx"));
const sized = files.map((f) => ({ f, n: readFileSync(`${dir}/${f}`).length })).sort((a, b) => b.n - a.n);
const byKey: Record<string, SourceKey> = {
  [sized[0].f]: "white-goods-screens",
  [sized[1].f]: "small-appliances",
  [sized[2].f]: "electronics",
};

const out: Record<string, unknown>[] = [];
for (const f of files) {
  const key = byKey[f];
  const wb = parseWorkbook(readFileSync(`${dir}/${f}`), key);
  for (const sheet of wb.sheets) {
    if (!isProductSheet(key, sheet.sheetName)) continue;
    for (const pr of sheet.rows) {
      const row = normalizeRow(key, sheet.sheetName, pr, sheet.columns, categoryForSheet(key, sheet.sheetName));
      const rp = resolvedPrice(row);
      out.push({
        src: key, sheet: row.sheetName, rowRef: row.rowRef ?? null,
        sku: row.sku, synth: row.skuIsSynthetic, model: row.model,
        title: (row.title || "").slice(0, 90),
        cost: row.internalCost ?? null, price: rp.price,
        avail: row.availability, channel: row.importChannel ?? null,
        importer: row.importerName ?? null,
        stock: row.totalStock ?? null,
      });
    }
  }
}
writeFileSync(process.env.OUT!, JSON.stringify(out));
const n = (p: (r: Record<string, unknown>) => boolean) => out.filter(p).length;
console.log("rows:", out.length,
  "| real sku:", n((r) => !r.synth), "| synthetic:", n((r) => !!r.synth),
  "| priced:", n((r) => r.price != null), "| parallel:", n((r) => r.channel === "PARALLEL"),
  "| not orderable:", n((r) => r.avail && r.avail !== "ORDERABLE"));
