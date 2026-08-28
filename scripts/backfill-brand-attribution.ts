// One-off repair for Product.brandId after the import's brand derivation was
// fixed (see scripts/check-brand-attribution.ts for what was wrong).
//
// This exists instead of "just run a sync" because a sync no longer rewrites
// brand on a product it already created — an existing product takes stock and
// nothing else, which is the rule that finally stopped the catalog being
// re-derived out from under everyone. That rule is right and should stay. The
// brands still need correcting once, from the same sheets, with the fixed
// parser. So: one script, one field, one run.
//
// It reuses the sync's own loading, parsing, row-matching and brand-resolution
// code rather than reimplementing any of it — a second implementation that
// drifted would file products under near-duplicate brand rows and quietly make
// things worse.
//
//   npm run fix:brands              # dry run, changes nothing
//   npm run fix:brands -- --apply   # writes, after a CSV backup
//
// Needs DATABASE_URL and the Supabase storage credentials the sync uses.
// Run it through the npm script rather than tsx directly: reading a source
// file goes through lib/inventory/storage.ts, which imports "server-only",
// and outside Next that resolves only with --conditions=react-server. Without
// it every source is skipped with a misleading "cannot be imported from a
// Client Component" message that looks like a broken script.
import "dotenv/config";
import { writeFileSync } from "fs";
import { db } from "../src/lib/db";
import { parseWorkbook } from "../src/lib/inventory/excel-parser";
import { normalizeRow } from "../src/lib/inventory/normalizer";
import { brandLikeDividers } from "../src/lib/inventory/brand-extractor";
import { findExistingProduct, resolveBrandId } from "../src/lib/inventory/sync";
import type { SourceKey } from "../src/lib/inventory/sheet-map";
import type { ParsedSheet } from "../src/lib/inventory/types";

const APPLY = process.argv.includes("--apply");

type Change = {
  sku: string;
  title: string;
  fromBrand: string;
  toBrand: string;
  enrichmentStatus: string;
  productId: string;
  toBrandId: string | null; // null when the brand row does not exist yet
};

async function loadSheets(source: {
  id: string;
  key: string;
  sourceType: string;
  storagePath: string | null;
  sheetUrl: string | null;
  categorySlugOverride: string | null;
}): Promise<{ sheets: ParsedSheet[]; categoryFor: (sheet: string) => string | null } | null> {
  if (source.sourceType === "GOOGLE_SHEET") {
    const { fetchSheetWorkbook, parseGoogleWorkbook, categoryForGoogleSheetTab, extractSpreadsheetId } =
      await import("../src/lib/inventory/google-sheets-source");
    if (!source.sheetUrl) return null;
    const id = extractSpreadsheetId(source.sheetUrl);
    if (!id) return null;
    const workbook = parseGoogleWorkbook(await fetchSheetWorkbook(id), source.categorySlugOverride);
    return {
      sheets: workbook.sheets,
      categoryFor: (sheet) => categoryForGoogleSheetTab(sheet, source.categorySlugOverride),
    };
  }
  const { downloadInventoryFile, isStorageConfigured } = await import("../src/lib/inventory/storage");
  if (!isStorageConfigured() || !source.storagePath) return null;
  const workbook = parseWorkbook(await downloadInventoryFile(source.storagePath), source.key as SourceKey);
  return { sheets: workbook.sheets, categoryFor: () => source.categorySlugOverride ?? null };
}

async function main() {
  const sources = await db.inventorySource.findMany({ where: { isActive: true } });
  if (sources.length === 0) {
    console.log("no active inventory sources — nothing to read");
    return;
  }

  const changes: Change[] = [];
  let rowsRead = 0;
  let unmatchedRows = 0;
  let alreadyCorrect = 0;
  let noBrandDerived = 0;

  for (const source of sources) {
    let loaded;
    try {
      loaded = await loadSheets(source);
    } catch (err) {
      console.log(`SKIP  ${source.key}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    if (!loaded) {
      console.log(`SKIP  ${source.key}: not readable (no storage path / sheet url, or storage not configured)`);
      continue;
    }

    for (const sheet of loaded.sheets) {
      // Same divider-derived brand hints the sync feeds normalizeRow, so a
      // row whose brand only appears on a yellow section header resolves
      // here exactly as it would there.
      const knownBrands = brandLikeDividers(
        sheet.rows.map((r) => r.sectionLabel).filter((l): l is string => l !== null),
      );

      for (const parsedRow of sheet.rows) {
        rowsRead++;
        const row = normalizeRow(
          source.key,
          sheet.sheetName,
          parsedRow,
          sheet.columns,
          loaded.categoryFor(sheet.sheetName),
          knownBrands,
        );
        if (!row.brandName) {
          noBrandDerived++;
          continue;
        }

        // Resolving the brand id would CREATE the row, so in a dry run look
        // it up read-only and report a missing one rather than writing it.
        const existingBrand = await db.brand.findFirst({ where: { name: row.brandName.trim() } });
        const product = await findExistingProduct(source.id, row, existingBrand?.id ?? "");
        if (!product) {
          unmatchedRows++;
          continue;
        }
        if (existingBrand && product.brandId === existingBrand.id) {
          alreadyCorrect++;
          continue;
        }

        const currentBrand = await db.brand.findUnique({
          where: { id: product.brandId },
          select: { name: true },
        });
        if (currentBrand?.name === row.brandName.trim()) {
          alreadyCorrect++;
          continue;
        }

        changes.push({
          sku: product.sku,
          title: product.title,
          fromBrand: currentBrand?.name ?? "(unknown)",
          toBrand: row.brandName.trim(),
          enrichmentStatus: product.enrichmentStatus,
          productId: product.id,
          toBrandId: existingBrand?.id ?? null,
        });
      }
    }
  }

  const enrichedTouched = changes.filter((c) => c.enrichmentStatus === "ENRICHED");
  const newBrandRows = new Set(changes.filter((c) => !c.toBrandId).map((c) => c.toBrand));

  console.log("");
  console.log(`rows read from the sheets      ${rowsRead}`);
  console.log(`  no brand derivable            ${noBrandDerived}`);
  console.log(`  no product matched            ${unmatchedRows}`);
  console.log(`  brand already correct         ${alreadyCorrect}`);
  console.log(`  brand WOULD CHANGE            ${changes.length}`);
  console.log("");
  console.log(`products marked ENRICHED among them   ${enrichedTouched.length}`);
  console.log(`brand rows that do not exist yet      ${newBrandRows.size}${newBrandRows.size ? " — " + [...newBrandRows].slice(0, 8).join(", ") : ""}`);

  if (changes.length === 0) {
    console.log("\nnothing to do.");
    return;
  }

  console.log("\nfirst 25 changes:");
  console.log("sku          | from                 | to                   | title");
  for (const c of changes.slice(0, 25)) {
    console.log(
      `${c.sku.padEnd(12)} | ${c.fromBrand.slice(0, 20).padEnd(20)} | ${c.toBrand.slice(0, 20).padEnd(20)} | ${c.title.slice(0, 44)}`,
    );
  }

  if (!APPLY) {
    console.log(`\n(dry run — nothing written. re-run with --apply to write all ${changes.length}.)`);
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `brand-backfill-backup-${stamp}.csv`;
  writeFileSync(
    backupPath,
    ["productId,sku,fromBrand,toBrand,enrichmentStatus"]
      .concat(
        changes.map((c) =>
          [c.productId, c.sku, c.fromBrand, c.toBrand, c.enrichmentStatus]
            .map((v) => `"${String(v).replace(/"/g, '""')}"`)
            .join(","),
        ),
      )
      .join("\n"),
    "utf8",
  );
  console.log(`\nbackup written: ${backupPath}`);

  let written = 0;
  for (const c of changes) {
    const brandId = c.toBrandId ?? (await resolveBrandId(c.toBrand));
    await db.product.update({ where: { id: c.productId }, data: { brandId } });
    written++;
  }
  console.log(`updated ${written} products. brandId only — no other field was touched.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
