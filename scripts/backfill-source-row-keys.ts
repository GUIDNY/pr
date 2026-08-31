// One-time catch-up for Product.sourceRowKey across everything already in
// the catalog. The logic lives in src/lib/inventory/backfill-row-keys.ts,
// which the admin's own upload action also calls — see that file for why
// the keys have to be written from the file currently in storage.
//
// Why it is worth running once rather than waiting for a sync:
//
//   694 products came from sheet rows with no SKU of their own. Until
//   sourceRowKey existed, the sync recognised such a product on a later run
//   by its *current* brand, model and title — and we have since rewritten
//   titles, re-derived brands and reassigned categories wholesale. The day
//   a shifted sheet arrives, that fallback looks for values that no longer
//   exist, fails, and creates a second copy beside the one we curated.
//
//   npm run fix:rowkeys              # dry run, changes nothing
//   npm run fix:rowkeys -- --apply   # writes, after a CSV backup
//
// Run it through the npm script, not tsx directly: reading a source file
// goes through lib/inventory/storage.ts, which imports "server-only", and
// outside Next that resolves only with --conditions=react-server.
import "dotenv/config";
import { writeFileSync } from "fs";
import { db } from "../src/lib/db";
import { stampSourceRowKeys, type StampedKey } from "../src/lib/inventory/backfill-row-keys";

const APPLY = process.argv.includes("--apply");

async function main() {
  const before = await db.product.count({ where: { isTemporarySku: true } });
  const beforeKeyed = await db.product.count({
    where: { isTemporarySku: true, sourceRowKey: { not: null } },
  });

  // Inactive sources are never read by a sync, so they cannot grow a
  // duplicate — but their products are still in the catalog and the source
  // can be switched back on, so they get keys too.
  const sources = await db.inventorySource.findMany({
    select: { id: true, key: true, sourceType: true, storagePath: true, sheetUrl: true, categorySlugOverride: true, isActive: true },
    orderBy: { key: "asc" },
  });
  if (sources.length === 0) {
    console.log("no inventory sources — nothing to read");
    return;
  }

  const written: (StampedKey & { source: string })[] = [];
  let rowsRead = 0, realSku = 0, noKey = 0, noProduct = 0, notTemp = 0, already = 0, collided = 0;

  for (const source of sources) {
    const r = await stampSourceRowKeys(source, { apply: APPLY });
    if (r.skipped) {
      console.log(`SKIP  ${source.key}: ${r.skipped}`);
      continue;
    }
    rowsRead += r.rowsRead;
    realSku += r.realSkuRows;
    noKey += r.noKeyDerivable;
    noProduct += r.noProductAtPosition;
    notTemp += r.notTemporary;
    already += r.alreadyKeyed;
    collided += r.collidedProductIds.length;
    written.push(...r.written.map((w) => ({ ...w, source: source.key })));
    console.log(
      `${source.isActive ? "    " : "off "}${source.key.padEnd(52)} ${String(r.written.length).padStart(4)} keys` +
        (r.collidedProductIds.length ? `  (${r.collidedProductIds.length} skipped, two rows share a key)` : ""),
    );
  }

  console.log("");
  console.log(`temp-SKU products in the catalog   ${before}`);
  console.log(`  already carrying a key           ${beforeKeyed}`);
  console.log("");
  console.log(`rows read from the sheets          ${rowsRead}`);
  console.log(`  have a real SKU (no key needed)  ${realSku}`);
  console.log(`  nothing to key on                ${noKey}`);
  console.log(`  no product at that position      ${noProduct}`);
  console.log(`  product there has a real SKU     ${notTemp}`);
  console.log(`  key already correct              ${already}`);
  console.log(`  two rows share a key, skipped    ${collided}`);
  console.log(`  ${APPLY ? "WRITTEN                          " : "WOULD WRITE                      "} ${written.length}`);

  if (written.length > 0) {
    console.log("\nfirst 15:");
    for (const w of written.slice(0, 15)) {
      console.log(`  ${w.sku.padEnd(8)} ${w.key}  ${w.sheet.slice(0, 14).padEnd(14)} r${String(w.rowIndex).padEnd(5)} ${w.title.slice(0, 40)}`);
    }
  }

  if (APPLY && written.length > 0) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backup = `source-row-key-backfill-${stamp}.csv`;
    writeFileSync(
      backup,
      ["productId,sku,source,sheet,rowIndex,sourceRowKey,title"]
        .concat(
          written.map((w) =>
            [w.productId, w.sku, w.source, w.sheet, w.rowIndex, w.key, w.title]
              .map((v) => `"${String(v).replace(/"/g, '""')}"`)
              .join(","),
          ),
        )
        .join("\n"),
      "utf8",
    );
    console.log(`\nrecord written: ${backup}`);
    console.log("sourceRowKey only — no other field was touched.");
  } else if (!APPLY) {
    console.log(`\n(dry run — nothing written. re-run with --apply to write all ${written.length}.)`);
  }

  // What is left is what a shifted sheet could still duplicate: a temp-SKU
  // product with no key, whose row is no longer where the database thinks
  // it is.
  const unkeyed = await db.product.groupBy({
    by: ["sourceId"],
    where: { isTemporarySku: true, sourceRowKey: null },
    _count: { _all: true },
  });
  const activeIds = new Set(sources.filter((s) => s.isActive).map((s) => s.id));
  const atRisk = unkeyed.filter((u) => u.sourceId && activeIds.has(u.sourceId));
  console.log(
    `\ntemp-SKU products still without a key   ${unkeyed.reduce((n, u) => n + u._count._all, 0)}` +
      `  (${atRisk.reduce((n, u) => n + u._count._all, 0)} of them on an active source)${APPLY ? "" : "  — before writing"}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
