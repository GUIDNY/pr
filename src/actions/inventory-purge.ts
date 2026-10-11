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

/**
 * The two kinds of record that are not a product of this shop.
 *
 *   NO_PRICE_LIST — its source is not one of the three workbooks. 268 of
 *   them point at Google Sheet sources switched off in August, which no
 *   sync can update.
 *
 *   SUBTOTAL_ROW — it is not a product at all. The sheets carry running
 *   totals among the rows and eleven became records: one titled "סה״כ",
 *   one whose SKU is "סה״כ", one titled with its own tab's name, and eight
 *   brand names carrying between 30 and 369 "units" at ₪0. 2,111 units that
 *   do not exist. The import refuses these now — see looksLikeSubtotalRow —
 *   and the predicate here is the same one, written for SQL: no model, no
 *   price, no cost, and a quantity no single appliance line carries.
 *
 * Two targets and two buttons rather than one of each: the reasons are
 * different, the evidence is different, and putting two irreversible
 * deletions behind one press is how the wrong one happens.
 */
export type PurgeTarget = "NO_PRICE_LIST" | "SUBTOTAL_ROW";

const WHERE: Record<PurgeTarget, Record<string, unknown>> = {
  NO_PRICE_LIST: { source: { sourceType: { not: "EXCEL" } } },
  SUBTOTAL_ROW: {
    source: { sourceType: "EXCEL" },
    OR: [{ model: null }, { model: "" }],
    price: { lte: 0 },
    stockQty: { gte: 25 },
  },
};

export async function inspectNonPriceListProducts(
  target: PurgeTarget = "NO_PRICE_LIST",
): Promise<PurgeResult> {
  const session = await getSession();
  if (!session || !isSiteAdmin(session.role)) {
    return { success: false, error: "אין הרשאה", products: 0, images: 0, enriched: 0, orderLines: 0 };
  }

  const where = WHERE[target];
  /* supplierCost is excluded in TypeScript rather than in the where clause:
     Prisma cannot express "null or zero" alongside the OR above without
     nesting the whole thing, and the set is eleven rows. A line the
     supplier priced at all is a real line, whatever else is missing. */
  const candidates = await db.product.findMany({
    where,
    select: { id: true, supplierCost: true, enrichmentStatus: true, _count: { select: { images: true } } },
  });
  const kept = candidates.filter((p) => p.supplierCost === null || p.supplierCost <= 0);
  const ids = kept.map((p) => p.id);

  const orderLines = ids.length > 0 ? await db.orderItem.count({ where: { productId: { in: ids } } }) : 0;

  return {
    success: true,
    error: null,
    products: kept.length,
    images: kept.reduce((n, p) => n + p._count.images, 0),
    enriched: kept.filter((p) => p.enrichmentStatus === "ENRICHED").length,
    orderLines,
  };
}

/** The ids the given target covers, under the same rules as the inspection. */
async function targetIds(target: PurgeTarget): Promise<string[]> {
  const rows = await db.product.findMany({
    where: WHERE[target],
    select: { id: true, supplierCost: true },
  });
  return rows.filter((p) => p.supplierCost === null || p.supplierCost <= 0).map((p) => p.id);
}

export async function purgeNonPriceListProductsAction(
  target: PurgeTarget = "NO_PRICE_LIST",
): Promise<PurgeResult> {
  const session = await getSession();
  if (!session || !isSiteAdmin(session.role)) {
    return { success: false, error: "אין הרשאה", products: 0, images: 0, enriched: 0, orderLines: 0 };
  }

  const found = await inspectNonPriceListProducts(target);
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

  const ids = await targetIds(target);

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
    /* Only for the source-less group: a subtotal row belongs to a price
       list that is working perfectly well. */
    const sources =
      target === "NO_PRICE_LIST"
        ? await tx.inventorySource.deleteMany({
            where: { sourceType: { not: "EXCEL" }, products: { none: {} } },
          })
        : { count: 0 };
    return { products: removed.count, sources: sources.count };
  });

  await logAudit({
    actorId: session.sub,
    action: target === "SUBTOTAL_ROW" ? "PRODUCTS_PURGED_SUBTOTAL_ROWS" : "PRODUCTS_PURGED_NO_PRICE_LIST",
    entityType: "Product",
    entityId: "bulk",
    metadata: {
      target,
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
