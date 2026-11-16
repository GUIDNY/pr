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

export type PriorityStockLine = { warehouse: string; warehouseName: string | null; status: string; qty: number };
export type PriorityStock = { totalQty: number; lines: PriorityStockLine[] };
export type PriorityStockResult = {
  /** null when the mirror could not be read at all. */
  syncedAt: Date | null;
  bySku: Map<string, PriorityStock>;
};

export const normalizeSku = (sku: string) => sku.trim().replace(/^0+(?=\d)/, "");

/**
 * What Priority says about one order line, and how we found it.
 *
 * `null` means Priority has no item under this SKU *and* none whose
 * description names the product's model — "not found", which is not the
 * same as "found, zero on the shelf". PR-611513 showed the two collapsed
 * into one red "אין במלאי": Siemens TQ515D09 is our 1794 and Priority's
 * 770032, two in warehouse 1, and 454 of the 1,315 live products in stock
 * had no SKU match on 16 November.
 */
export type PriorityLookup =
  | { by: "sku"; stock: PriorityStock }
  | { by: "model"; matches: { sku: string; stock: PriorityStock }[]; partial: string | null }
  | null;

/**
 * The model as a regex over Priority's upper-cased description: the same
 * letters and digits in order, a space or hyphen allowed between any two,
 * and no letter or digit on either side. The boundaries are what keep
 * LC-801 from matching LC8010RD and PRO4460 from matching PRO4460L.
 * A model without a digit, or shorter than five characters, is a brand or
 * a series name and is not searched for.
 */
export function modelPattern(model: string | null | undefined): string | null {
  return patternFor((model ?? "").toUpperCase().replace(/[^A-Z0-9]/g, ""), 5);
}

function patternFor(m: string, minLength: number): string | null {
  if (m.length < minLength || !/\d/.test(m)) return null;
  return `(?<![A-Z0-9])${m.split("").join("[[:space:]-]*")}(?![A-Z0-9])`;
}

/**
 * The model without the importer's suffix: up to the first "(" or "/", then
 * up to the first "-" or space. "MDWMT030S(W)-W-IL" → "MDWMT030S", which
 * Priority writes as "MDWMT030S-6474" (PR-200999, 16 November).
 * Null when it is the whole model already, or too short to name a product:
 * at least six characters with a digit, the same boundaries as the full one.
 */
export function modelStem(model: string | null | undefined): string | null {
  const head = (model ?? "").trim().split(/[(/]/)[0].split(/[-\s]/)[0];
  const stem = head.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const full = (model ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (stem === full || stem.length < 6 || !/\d/.test(stem)) return null;
  return stem;
}

async function findByPattern(pattern: string): Promise<{ sku: string; stock: PriorityStock }[]> {
  const rows = await db.$queryRaw<{ skuNorm: string; totalQty: unknown; lines: PriorityStockLine[] }[]>`
    select b."skuNorm", b."totalQty", b.lines from "PriorityStockBySku" b
    where b."skuNorm" in (select distinct "skuNorm" from "PriorityStockLine" where upper(description) ~ ${pattern})
    order by b."totalQty" desc, b."skuNorm"`;
  return rows.map((r) => ({ sku: r.skuNorm, stock: { totalQty: Number(r.totalQty), lines: r.lines } }));
}

/**
 * Most specific first, and the first stage that finds anything wins: the
 * whole model, then its stem. `partial` names the stem when that is what
 * matched, so the page can say the match was on part of the model.
 */
async function findByModel(
  model: string | null,
): Promise<{ matches: { sku: string; stock: PriorityStock }[]; partial: string | null }> {
  const full = modelPattern(model);
  if (full) {
    const matches = await findByPattern(full);
    if (matches.length) return { matches, partial: null };
  }
  const stem = modelStem(model);
  const stemPattern = stem ? patternFor(stem, 6) : null;
  if (stem && stemPattern) {
    const matches = await findByPattern(stemPattern);
    if (matches.length) return { matches, partial: stem };
  }
  return { matches: [], partial: null };
}

/**
 * The lookup the order page uses: by SKU first, and only where that finds
 * nothing, by the product's model in Priority's description. Read-only.
 */
export async function getPriorityStockForItems(
  items: { sku: string; model: string | null }[],
): Promise<{ syncedAt: Date | null; lookups: PriorityLookup[] }> {
  const { syncedAt, bySku } = await getPriorityStock(items.map((i) => i.sku));
  if (!syncedAt) return { syncedAt, lookups: items.map(() => null) };
  const lookups = await Promise.all(
    items.map(async (item): Promise<PriorityLookup> => {
      const stock = bySku.get(normalizeSku(item.sku));
      if (stock) return { by: "sku", stock };
      try {
        const { matches, partial } = await findByModel(item.model);
        return matches.length ? { by: "model", matches, partial } : null;
      } catch {
        return null;
      }
    }),
  );
  return { syncedAt, lookups };
}

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
