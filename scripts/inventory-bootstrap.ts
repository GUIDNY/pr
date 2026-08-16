// One-off bootstrap: load the real Excel workbooks from the local machine
// and run them through the same parse -> normalize -> diff -> apply pipeline
// the real (Supabase Storage-backed) sync will use. This script is NOT part
// of the deployed app — a deployed instance can't reach a local file, which
// is exactly why the real sync reads from Supabase Storage instead. This is
// only how the very first import happens, from the developer's machine.
import "dotenv/config";
import { createHash } from "crypto";
import fs from "fs";
import { db } from "../src/lib/db";
import { parseWorkbook } from "../src/lib/inventory/excel-parser";
import { normalizeRow, findDuplicates } from "../src/lib/inventory/normalizer";
import { applyRowsForSource, markMissingProducts, recordUnknownColumnAlerts, conflictSkuSet } from "../src/lib/inventory/sync";
import { INVENTORY_SOURCES } from "../src/lib/inventory/sheet-map";
import type { NormalizedProductRow } from "../src/lib/inventory/types";

const DESKTOP_DIR = "/Users/idanguindy/Desktop/אקסל פי אר ";

async function main() {
  const startedAt = Date.now();
  console.log("Starting inventory bootstrap sync...");

  const syncRun = await db.inventorySyncRun.create({
    data: { trigger: "MANUAL", status: "RUNNING", sourceIds: "[]" },
  });

  const sourceIds: string[] = [];
  const allRows: NormalizedProductRow[] = [];
  const perSourceRows = new Map<string, NormalizedProductRow[]>();
  const perSourceUnknowns = new Map<string, { sheetName: string; unknownLabels: string[] }[]>();

  let totalRowsScanned = 0;

  for (const { key, filename } of INVENTORY_SOURCES) {
    const filePath = `${DESKTOP_DIR}/${filename}`;
    const bytes = fs.readFileSync(filePath);
    const fileHash = createHash("sha256").update(bytes).digest("hex");

    const source = await db.inventorySource.upsert({
      where: { key },
      update: { fileHash, fileSizeBytes: bytes.length, lastScannedAt: new Date() },
      create: {
        key,
        filename,
        fileHash,
        fileSizeBytes: bytes.length,
        isActive: true,
        lastScannedAt: new Date(),
      },
    });
    sourceIds.push(source.id);

    const workbook = parseWorkbook(bytes, key);
    const unknowns = workbook.sheets
      .filter((s) => s.unknownLabels.length > 0)
      .map((s) => ({ sheetName: s.sheetName, unknownLabels: s.unknownLabels }));
    perSourceUnknowns.set(source.id, unknowns);

    const rows: NormalizedProductRow[] = [];
    for (const sheet of workbook.sheets) {
      totalRowsScanned += sheet.rows.length;
      for (const row of sheet.rows) {
        rows.push(normalizeRow(key, sheet.sheetName, row));
      }
    }
    findDuplicates(rows); // mutates row.issues in place for within-source dupes

    perSourceRows.set(source.id, rows);
    allRows.push(...rows);
    console.log(`  parsed ${filename}: ${rows.length} rows across ${workbook.sheets.length} sheets (skipped: ${workbook.skippedSheets.join(", ") || "none"})`);
  }

  const conflicts = conflictSkuSet(allRows);
  if (conflicts.size > 0) {
    console.log(`  cross-source SKU conflicts detected: ${conflicts.size}`);
  }

  let productsAdded = 0;
  let productsUpdated = 0;
  let productsMissing = 0;
  let priceChanges = 0;
  let stockChanges = 0;

  for (const sourceId of sourceIds) {
    const rows = perSourceRows.get(sourceId) ?? [];
    console.log(`  applying ${rows.length} rows for source ${sourceId}...`);
    const result = await applyRowsForSource(sourceId, rows, syncRun.id, conflicts);
    productsAdded += result.productsAdded;
    productsUpdated += result.productsUpdated;
    priceChanges += result.priceChanges;
    stockChanges += result.stockChanges;

    const missing = await markMissingProducts(sourceId, result.seenSkus, syncRun.id);
    productsMissing += missing;

    await recordUnknownColumnAlerts(sourceId, syncRun.id, perSourceUnknowns.get(sourceId) ?? []);

    await db.inventorySource.update({ where: { id: sourceId }, data: { lastSyncedAt: new Date() } });
    console.log(`    -> added ${result.productsAdded}, updated ${result.productsUpdated}, missing ${missing}`);
  }

  const errorCount = await db.inventoryAlert.count({
    where: { syncRunId: syncRun.id, severity: "CRITICAL" },
  });

  await db.inventorySyncRun.update({
    where: { id: syncRun.id },
    data: {
      status: "SUCCESS",
      sourceIds: JSON.stringify(sourceIds),
      rowsScanned: totalRowsScanned,
      productsAdded,
      productsUpdated,
      productsMissing,
      priceChanges,
      stockChanges,
      errorCount,
      finishedAt: new Date(),
    },
  });

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`Done in ${elapsed}s. Added ${productsAdded}, updated ${productsUpdated}, missing ${productsMissing}, price changes ${priceChanges}, stock changes ${stockChanges}, alerts(critical) ${errorCount}.`);
}

main()
  .catch(async (e) => {
    console.error("Bootstrap sync failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
