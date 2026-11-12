import "server-only";
import { db } from "@/lib/db";

/**
 * Warehouse stock as Priority holds it, mirrored hourly by the read-only
 * robot on the office Mac (buytoday/priority-stock on that machine).
 *
 * This is a second, independent reading of "is it on the shelf" next to
 * `Product.stockQty`, which comes from the supplier price sheets. They are
 * allowed to disagree — that disagreement is exactly what the order page
 * needs to see before somebody promises a delivery.
 *
 * The mirror lives in its own objects ("PriorityStockLine",
 * "PriorityStockBySku"), written only through priority_stock_replace(),
 * and nothing here writes. If the mirror is missing or stale the page says
 * so rather than showing a number.
 *
 * Priority's SKUs carry a leading zero the site's do not (0170623 / 170623),
 * so both sides are matched without leading zeros.
 */

export type PriorityStockLine = { warehouse: string; status: string; qty: number };
export type PriorityStock = { totalQty: number; lines: PriorityStockLine[] };
export type PriorityStockResult = {
  /** null when the mirror could not be read at all. */
  syncedAt: Date | null;
  bySku: Map<string, PriorityStock>;
};

export const normalizeSku = (sku: string) => sku.trim().replace(/^0+(?=\d)/, "");

export async function getPriorityStock(skus: string[]): Promise<PriorityStockResult> {
  const keys = [...new Set(skus.map(normalizeSku).filter(Boolean))];
  const bySku = new Map<string, PriorityStock>();
  try {
    const [rows, sync] = await Promise.all([
      keys.length
        ? db.$queryRaw<{ skuNorm: string; totalQty: unknown; lines: PriorityStockLine[] }[]>`
            select "skuNorm", "totalQty", lines from "PriorityStockBySku" where "skuNorm" = any(${keys})`
        : Promise.resolve([]),
      db.$queryRaw<{ finishedAt: Date }[]>`
        select "finishedAt" from "PriorityStockSync" where ok order by id desc limit 1`,
    ]);
    for (const r of rows) bySku.set(r.skuNorm, { totalQty: Number(r.totalQty), lines: r.lines });
    return { syncedAt: sync[0]?.finishedAt ?? null, bySku };
  } catch {
    return { syncedAt: null, bySku };
  }
}
