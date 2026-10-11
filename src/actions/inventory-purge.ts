"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isSiteAdmin } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

/**
 * Remove the products that have no price list behind them.
 *
 * The owner's rule, 11 October: "the only source is the price lists." This
 * enforces it. Four Google Sheet sources were switched off in August and
 * left 268 products pointing at them — the sync skips an inactive source
 * entirely, so it never even marked them missing, and 85 sat on the site
 * for 53 days showing August stock and August prices. All of them are off
 * the site now; this is the irreversible half.
 *
 * It is a server action rather than a script because the database is only
 * reachable from the server. It is a permanent button rather than a one-off
 * because the rule is permanent: the day somebody connects another source
 * and disconnects it, the same products appear again with nothing to
 * update them.
 *
 * Four guards, and the second one is the one that matters:
 *
 *   - the site administrator only, not staff. Deleting products is not part
 *     of running the catalogue.
 *   - it refuses outright if any order line references one of them. An
 *     order line means somebody bought the product, and the row belongs to
 *     a customer and to the tax authority, not to a tidy-up.
 *   - it reports before it acts, and the caller has to confirm twice.
 *   - it writes an audit row with the counts, because "268 products
 *     vanished" is a question somebody will ask in six weeks.
 */
export type PurgeResult = {
  success: boolean;
  error: string | null;
  /** What was found, whether or not anything was deleted. */
  products: number;
  images: number;
  enriched: number;
  orderLines: number;
  deletedProducts?: number;
  deletedSources?: number;
};

/** Everything with a source that is not one of the three workbooks. */
const NOT_A_PRICE_LIST = { source: { sourceType: { not: "EXCEL" } } } as const;

export async function inspectNonPriceListProducts(): Promise<PurgeResult> {
  const session = await getSession();
  if (!session || !isSiteAdmin(session.role)) {
    return { success: false, error: "אין הרשאה", products: 0, images: 0, enriched: 0, orderLines: 0 };
  }

  const [products, images, enriched, orderLines] = await Promise.all([
    db.product.count({ where: NOT_A_PRICE_LIST }),
    db.productImage.count({ where: { product: NOT_A_PRICE_LIST.source } }),
    db.product.count({ where: { ...NOT_A_PRICE_LIST, enrichmentStatus: "ENRICHED" } }),
    db.orderItem.count({ where: { product: NOT_A_PRICE_LIST.source } }),
  ]);

  return { success: true, error: null, products, images, enriched, orderLines };
}

export async function purgeNonPriceListProductsAction(): Promise<PurgeResult> {
  const session = await getSession();
  if (!session || !isSiteAdmin(session.role)) {
    return { success: false, error: "אין הרשאה", products: 0, images: 0, enriched: 0, orderLines: 0 };
  }

  const found = await inspectNonPriceListProducts();
  if (!found.success) return found;
  if (found.products === 0) {
    return { ...found, error: "אין מוצרים למחיקה — כל הקטלוג מגיע מהמחירונים.", success: true };
  }
  /* The one condition that stops this outright. */
  if (found.orderLines > 0) {
    return {
      ...found,
      success: false,
      error:
        `${found.orderLines} שורות הזמנה מצביעות על המוצרים האלה. ` +
        `מחיקה תשבור היסטוריית הזמנות, ולכן לא בוצע שום שינוי.`,
    };
  }

  const ids = (await db.product.findMany({ where: NOT_A_PRICE_LIST, select: { id: true } })).map(
    (p) => p.id,
  );

  /* One transaction. A half-finished purge leaves products whose images and
     alerts are gone, which is worse than either outcome.
     CartItem is RESTRICT so it goes first; images, specs, slug history,
     favourites, reviews and source lines cascade; alerts and change events
     are SET NULL and so are deleted rather than left as nameless rows in
     the alerts list. */
  const deleted = await db.$transaction(async (tx) => {
    await tx.cartItem.deleteMany({ where: { productId: { in: ids } } });
    await tx.inventoryAlert.deleteMany({ where: { productId: { in: ids } } });
    await tx.inventoryChangeEvent.deleteMany({ where: { productId: { in: ids } } });
    const removed = await tx.product.deleteMany({ where: { id: { in: ids } } });
    /* And the sources themselves, once nothing points at them. Left behind,
       they come back the next time somebody opens a source picker. */
    const sources = await tx.inventorySource.deleteMany({
      where: { sourceType: { not: "EXCEL" }, products: { none: {} } },
    });
    return { products: removed.count, sources: sources.count };
  });

  await logAudit({
    actorId: session.sub,
    action: "PRODUCTS_PURGED_NO_PRICE_LIST",
    entityType: "Product",
    entityId: "bulk",
    metadata: {
      products: deleted.products,
      sources: deleted.sources,
      images: found.images,
      enriched: found.enriched,
    },
  });

  revalidatePath("/admin/inventory");
  revalidatePath("/admin/inventory/problems");

  return {
    ...found,
    success: true,
    error: null,
    deletedProducts: deleted.products,
    deletedSources: deleted.sources,
  };
}
