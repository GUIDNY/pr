// READ ONLY over the workbooks. Extracts every row with the project's own
// importer and availability detection, for the full catalogue reconciliation.
import * as XLSX from "xlsx";
import { readFileSync, readdirSync, writeFileSync } from "fs";
import { splitImporterFromBrand, rowImportChannel } from "@/lib/inventory/import-channel";
import { sourceAvailability } from "@/lib/inventory/availability";

const dir = process.env.SHEETDIR!;
const out: Record<string, unknown>[] = [];
for (const file of readdirSync(dir).filter((f) => f.endsWith(".xlsx"))) {
  const wb = XLSX.read(readFileSync(`${dir}/${file}`), { type: "buffer" });
  for (const name of wb.SheetNames) {
    const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: null });
    const hdrIdx = grid.findIndex((r) => (r || []).some((c) => c && String(c).trim() === "מק'ט"));
    if (hdrIdx < 0) continue;
    const hdr = (grid[hdrIdx] || []).map((c) => (c ? String(c).trim() : ""));
    for (let i = hdrIdx + 1; i < grid.length; i++) {
      const row = grid[i] || [];
      const values: Record<string, string | number | null> = {};
      hdr.forEach((h, j) => { if (h) values[h] = (row[j] ?? null) as string | number | null; });
      const get = (k: string) => {
        const v = values[k];
        return v === null || v === undefined || String(v).trim() === "" ? null : String(v).trim();
      };
      const sku = get("מק'ט"), model = get("דגם"), desc = get("תיאור מוצר") ?? get("תאור מוצר");
      if (!sku && !model && !desc) continue;
      const brandCell = get("חברה") ?? get("מותג");
      const split = splitImporterFromBrand(brandCell);
      const ch = rowImportChannel(values);
      const num = (k: string) => { const n = Number(get(k)); return Number.isFinite(n) && n > 0 ? n : null; };
      out.push({
        sheet: name.trim(), row_ref: i, sku, model, desc,
        brand_cell: brandCell, brand: split.brand,
        importer: split.importer ?? ch.importer ?? null,
        channel: split.channel === "PARALLEL" || ch.channel === "PARALLEL" ? "PARALLEL" : "OFFICIAL",
        colour: get("צבע"),
        cost: num("עלות ללא מעמ"), ceo: num('קוד מנכ"ל'),
        min_sale: num("מינימום למכירה"), shown: num("מחיר מוצג"),
        availability: sourceAvailability(values),
      });
    }
  }
}
writeFileSync(process.env.OUT!, JSON.stringify(out));
console.log("rows:", out.length,
  "| parallel:", out.filter((r) => r.channel === "PARALLEL").length,
  "| not orderable:", out.filter((r) => r.availability !== "ORDERABLE").length,
  "| with sku:", out.filter((r) => r.sku).length);
