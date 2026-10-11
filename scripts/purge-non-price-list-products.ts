/**
 * Remove the products that have no price list behind them.
 *
 * Why this exists, and why it is a script rather than a migration.
 *
 * Between August and 11 October, four Google Sheet sources were switched off
 * and 268 products were left pointing at them. Nothing could update those
 * products — the sync skips an inactive source entirely, so it never even
 * marked them missing — and 85 of them stayed on the site for 53 days
 * showing August stock and August prices. The owner's rule, stated that day:
 * "the only source is the price lists."
 *
 * All 268 were taken off the site first (isPublished = false), which is
 * reversible and immediate. This is the irreversible half, so it is opt-in:
 * a dry run by default, and it prints what it would remove.
 *
 * What was checked before writing it:
 *   - 0 OrderItem rows reference any of them. Nobody ever bought one, so no
 *     order history breaks.
 *   - 242 of the 268 are ENRICHED, holding 286 images and hand-written
 *     Hebrew descriptions. Three of them were the only holder of their
 *     content, and it was moved onto the price-list record that carries the
 *     same product before any of this ran.
 *   - CartItem and OrderItem are RESTRICT, so cart lines must go first or
 *     the delete is refused. Images, specs, slug history, favourites,
 *     reviews and source lines all CASCADE.
 *   - InventoryAlert and InventoryChangeEvent are SET NULL, which would
 *     leave thousands of nameless rows in the alerts list, so they are
 *     deleted rather than orphaned.
 *
 * Run:
 *   npx tsx scripts/purge-non-price-list-products.ts            # dry run
 *   npx tsx scripts/purge-non-price-list-products.ts --apply    # do it
 */
import { db } from "../src/lib/db";

const APPLY = process.argv.includes("--apply");

async function main() {
  /* Defined by rule, not by a list of ids: a product whose source is not one
     of the three workbooks. That is the same predicate the back office now
     filters on, so this cannot drift from what the admin shows. */
  const doomed = await db.product.findMany({
    where: { source: { sourceType: { not: "EXCEL" } } },
    select: {
      id: true,
      sku: true,
      title: true,
      slug: true,
      price: true,
      stockQty: true,
      isPublished: true,
      enrichmentStatus: true,
      _count: { select: { images: true } },
      source: { select: { key: true, sourceType: true, isActive: true } },
      brand: { select: { name: true } },
    },
    orderBy: { price: "desc" },
  });

  if (doomed.length === 0) {
    console.log("Nothing to do: every product in the catalogue comes from a price list.");
    return;
  }

  const ids = doomed.map((p) => p.id);

  const [orderLines, cartLines, alerts, events, images] = await Promise.all([
    db.orderItem.count({ where: { productId: { in: ids } } }),
    db.cartItem.count({ where: { productId: { in: ids } } }),
    db.inventoryAlert.count({ where: { productId: { in: ids } } }),
    db.inventoryChangeEvent.count({ where: { productId: { in: ids } } }),
    db.productImage.count({ where: { productId: { in: ids } } }),
  ]);

  console.log(`\n${doomed.length} products have no price list behind them.\n`);
  console.log(`  still published : ${doomed.filter((p) => p.isPublished).length}`);
  console.log(`  enriched by hand: ${doomed.filter((p) => p.enrichmentStatus === "ENRICHED").length}`);
  console.log(`  images          : ${images}`);
  console.log(`  cart lines      : ${cartLines}   (deleted first — RESTRICT)`);
  console.log(`  alerts / events : ${alerts} / ${events}   (deleted, not orphaned)`);
  console.log(`  order lines     : ${orderLines}`);

  /* The one condition that stops this outright. An order line means somebody
     bought the product, and deleting it would take a row out of the order
     history that a customer and the tax authority can both ask about. */
  if (orderLines > 0) {
    console.error(
      `\nREFUSED: ${orderLines} order lines reference these products. ` +
        `Deleting them would break order history. Nothing was changed.`,
    );
    process.exitCode = 1;
    return;
  }

  console.log("\nThe twelve most valuable:\n");
  for (const p of doomed.slice(0, 12)) {
    const brand = p.brand?.name ? `${p.brand.name} ` : "";
    console.log(
      `  ${p.sku.padEnd(8)} ${brand}${p.title.slice(0, 44).padEnd(46)} ` +
        `${String(p.price).padStart(6)} x${p.stockQty}  ${p._count.images} img  [${p.source?.key ?? "—"}]`,
    );
  }

  if (!APPLY) {
    console.log(`\nDry run. Nothing was changed. Re-run with --apply to delete all ${doomed.length}.`);
    return;
  }

  /* One transaction: a half-finished purge leaves products whose images and
     alerts are gone, which is worse than either outcome. */
  const result = await db.$transaction(async (tx) => {
    await tx.cartItem.deleteMany({ where: { productId: { in: ids } } });
    await tx.inventoryAlert.deleteMany({ where: { productId: { in: ids } } });
    await tx.inventoryChangeEvent.deleteMany({ where: { productId: { in: ids } } });
    return tx.product.deleteMany({ where: { id: { in: ids } } });
  });

  const left = await db.product.count({ where: { source: { sourceType: { not: "EXCEL" } } } });
  console.log(`\nDeleted ${result.count} products. ${left} left with a non-price-list source.`);

  /* And the sources themselves, once nothing points at them. Left behind,
     they come back the next time somebody opens a source picker. */
  const emptied = await db.inventorySource.deleteMany({
    where: { sourceType: { not: "EXCEL" }, products: { none: {} } },
  });
  console.log(`Removed ${emptied.count} empty non-price-list sources.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
