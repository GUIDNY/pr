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
        /* rowIndex, not rowRef. The first version of this file wrote
           `row.rowRef`, which does not exist on a normalised row — so every
           one of the 3,423 rows came back with a null position and the only
           products that could be compared against a sheet row were the 1,086
           bound by SKU. The 1,603 bound by position, which are the majority
           and the ones the position guards are about, were silently skipped
           and the scan still printed a tidy total. `sourceRowRef` on Product
           is written from this field (sync.ts), so this is the name that
           joins the two. */
        src: key, sheet: row.sheetName, rowRef: row.rowIndex,
        sku: row.sku, synth: row.skuIsSynthetic, model: row.model,
        title: (row.title || "").slice(0, 90),
        cost: row.internalCost ?? null, price: rp.price,
        avail: row.availability, channel: row.importChannel ?? null,
        importer: row.importerName ?? null,
        /* The sum of every stock column on the row — מלאי, מלאי חדרה and
           תצוגה — which is what stockQty means. There is no totalStock
           field; an earlier version read one and so reported every row as
           having no stock at all. */
        stock: row.stockLines.reduce((t, l) => t + l.quantity, 0),
      });
    }
  }
}
writeFileSync(process.env.OUT!, JSON.stringify(out));
const n = (p: (r: Record<string, unknown>) => boolean) => out.filter(p).length;
console.log("rows:", out.length,
  "| real sku:", n((r) => !r.synth), "| synthetic:", n((r) => !!r.synth),
  "| priced:", n((r) => r.price != null), "| parallel:", n((r) => r.channel === "PARALLEL"),
  "| not orderable:", n((r) => !!r.avail && r.avail !== "ORDERABLE"),
  "| with stock:", n((r) => Number(r.stock) > 0));
