import "server-only";
import { db } from "@/lib/db";
import { normaliseSheetName } from "@/lib/inventory/sheet-map";

/**
 * The one page that answers "what happened in the last sync, and what do I
 * do about it".
 *
 * Built after the 11 October outage, and the shape of it is an answer to
 * how that outage stayed invisible for 35 days. Four tabs of the price list
 * stopped importing; the run reported SUCCESS every day; the only record
 * was 3,829 row-level warnings a day buried among thousands of unrelated
 * ones; and it surfaced as a customer ringing about a TV mount whose stock
 * had been frozen since September. Every number on this page exists because
 * somebody had to go and measure it by hand that day.
 *
 * Two rules it is built on, both the owner's words:
 *
 *   "the only source is the price lists" — so nothing here reports on any
 *   other kind of source, and a source that is not one of the three
 *   workbooks does not appear.
 *
 *   "I don't want a fault I don't know about" — so the report leads with
 *   what is wrong rather than with totals, and a tab that produced nothing
 *   is as prominent as a tab that failed.
 *
 * Every query here is a `select` with its columns counted. The last time a
 * back-office screen pulled whole Product rows it cost four days of
 * Supabase egress; see the note in CLAUDE.md.
 */

/** A price list, and whether it is actually being read. */
export type SourceLine = {
  id: string;
  key: string;
  filename: string;
  readAt: Date | null;
  uploadedAt: Date | null;
  sizeBytes: number | null;
  sheets: number;
  products: number;
};

/** One tab of one price list. */
export type SheetLine = {
  sheetName: string;
  sourceKey: string;
  products: number;
  live: number;
  readAt: Date | null;
  /** Days this tab lags the newest tab in the whole catalogue. */
  lagDays: number;
  mapped: boolean;
};

export type OpenFault = {
  id: string;
  type: string;
  severity: string;
  message: string;
  createdAt: Date;
};

export type SyncReport = {
  run: {
    startedAt: Date;
    finishedAt: Date | null;
    status: string;
    trigger: string;
    rowsScanned: number;
    productsAdded: number;
    productsUpdated: number;
    productsMissing: number;
    priceDiffs: number;
    stockChanges: number;
    criticalAlerts: number;
  } | null;
  sources: SourceLine[];
  sheets: SheetLine[];
  faults: OpenFault[];
};

/* The three workbooks and nothing else. A Google Sheet source is not a
   price list, and the four that were left switched off held 268 products
   that no sync could ever update — which is the other half of what went
   wrong. They are excluded here by type rather than by isActive, so
   switching one back on does not quietly put it back on this page. */
const PRICE_LIST_SOURCE = { sourceType: "EXCEL", isActive: true } as const;

export async function getSyncReport(): Promise<SyncReport> {
  const [run, sources, grouped, liveGrouped, faults] = await Promise.all([
    db.inventorySyncRun.findFirst({
      where: { status: { in: ["SUCCESS", "NO_CHANGES", "FAILED"] } },
      orderBy: { startedAt: "desc" },
      select: {
        id: true,
        startedAt: true,
        finishedAt: true,
        status: true,
        trigger: true,
        rowsScanned: true,
        productsAdded: true,
        productsUpdated: true,
        productsMissing: true,
        priceChanges: true,
        stockChanges: true,
        errorCount: true,
      },
    }),
    db.inventorySource.findMany({
      where: PRICE_LIST_SOURCE,
      select: {
        id: true,
        key: true,
        storagePath: true,
        lastScannedAt: true,
        uploadedAt: true,
        fileSizeBytes: true,
      },
      orderBy: { key: "asc" },
    }),
    db.product.groupBy({
      by: ["sourceId", "sourceSheet"],
      where: { sourceSheet: { not: null }, source: PRICE_LIST_SOURCE },
      _max: { lastExcelSyncAt: true },
      _count: { _all: true },
    }),
    db.product.groupBy({
      by: ["sourceSheet"],
      where: {
        sourceSheet: { not: null },
        source: PRICE_LIST_SOURCE,
        isPublished: true,
        stockQty: { gt: 0 },
      },
      _count: { _all: true },
    }),
    /* Only what is still wrong, worst first. A resolved fault is history and
       belongs on the alerts page, not on the page somebody opens to find out
       whether the shop is in order. */
    db.inventoryAlert.findMany({
      where: { isResolved: false, severity: "CRITICAL" },
      select: { id: true, type: true, severity: true, message: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const liveBySheet = new Map(liveGrouped.map((g) => [g.sourceSheet ?? "", g._count._all]));
  const sourceKeyById = new Map(sources.map((s) => [s.id, s.key]));

  /* The yardstick for "lagging" is the newest tab anywhere, not each
     workbook's own newest. Measuring a tab against its own file was the
     first version of this and it has a hole big enough to hide a whole
     dead source in: when every tab of a workbook stops at once they all lag
     each other by zero. Four switched-off sources sat at 53 days that way. */
  const newestAnywhere = grouped.reduce<Date | null>((acc, g) => {
    const at = g._max.lastExcelSyncAt;
    if (!at) return acc;
    return !acc || at > acc ? at : acc;
  }, null);
  const yardstick = newestAnywhere ?? new Date();

  const sheets: SheetLine[] = grouped
    .filter((g): g is typeof g & { sourceSheet: string } => g.sourceSheet !== null)
    .map((g) => {
      const readAt = g._max.lastExcelSyncAt;
      const lagDays = readAt ? (yardstick.getTime() - readAt.getTime()) / 86_400_000 : 9999;
      return {
        sheetName: g.sourceSheet,
        sourceKey: g.sourceId ? (sourceKeyById.get(g.sourceId) ?? "—") : "—",
        products: g._count._all,
        live: liveBySheet.get(g.sourceSheet) ?? 0,
        readAt,
        lagDays: Math.round(lagDays * 10) / 10,
        /* A tab whose stored name is not canonical was written by a run from
           before the names were normalised — it is, by definition, a tab the
           current sync did not match. */
        mapped: g.sourceSheet === normaliseSheetName(g.sourceSheet),
      };
    })
    .sort((a, b) => b.lagDays - a.lagDays || b.products - a.products);

  const sheetsBySource = new Map<string, number>();
  for (const g of grouped) {
    if (!g.sourceId) continue;
    sheetsBySource.set(g.sourceId, (sheetsBySource.get(g.sourceId) ?? 0) + 1);
  }
  const productsBySource = new Map<string, number>();
  for (const g of grouped) {
    if (!g.sourceId) continue;
    productsBySource.set(g.sourceId, (productsBySource.get(g.sourceId) ?? 0) + g._count._all);
  }

  return {
    run: run
      ? {
          startedAt: run.startedAt,
          finishedAt: run.finishedAt,
          status: run.status,
          trigger: run.trigger,
          rowsScanned: run.rowsScanned,
          productsAdded: run.productsAdded,
          productsUpdated: run.productsUpdated,
          productsMissing: run.productsMissing,
          /* Named for what it is. The column is called priceChanges and the
             run report said "289 price changes" every day for a fortnight
             while applying none of them — the sync is not allowed to write a
             price to an existing product, deliberately, so every one of
             those was a difference it had spotted and left alone. A number
             that says "changes" about something that never changed is how a
             report stops being read. */
          priceDiffs: run.priceChanges,
          stockChanges: run.stockChanges,
          criticalAlerts: run.errorCount,
        }
      : null,
    sources: sources.map((s) => ({
      id: s.id,
      key: s.key,
      filename: s.storagePath?.split("/").pop() ?? s.key,
      readAt: s.lastScannedAt,
      uploadedAt: s.uploadedAt,
      sizeBytes: s.fileSizeBytes,
      sheets: sheetsBySource.get(s.id) ?? 0,
      products: productsBySource.get(s.id) ?? 0,
    })),
    sheets,
    faults,
  };
}

export type ProductLine = {
  id: string;
  sku: string;
  slug: string;
  title: string;
  price: number;
  supplierCost: number | null;
  stockQty: number;
  sheet: string | null;
  brand: string;
  category: string;
  images: number;
  createdAt: Date;
};

const PRODUCT_LINE_SELECT = {
  id: true,
  sku: true,
  slug: true,
  title: true,
  price: true,
  supplierCost: true,
  stockQty: true,
  sourceSheet: true,
  createdAt: true,
  brand: { select: { name: true } },
  category: { select: { name: true } },
  _count: { select: { images: true } },
} as const;

type ProductLineRow = {
  id: string;
  sku: string;
  slug: string;
  title: string;
  price: number;
  supplierCost: number | null;
  stockQty: number;
  sourceSheet: string | null;
  createdAt: Date;
  brand: { name: string } | null;
  category: { name: string } | null;
  _count: { images: number };
};

function toLine(p: ProductLineRow): ProductLine {
  return {
    id: p.id,
    sku: p.sku,
    slug: p.slug,
    title: p.title,
    price: p.price,
    supplierCost: p.supplierCost,
    stockQty: p.stockQty,
    sheet: p.sourceSheet,
    brand: p.brand?.name ?? "",
    category: p.category?.name ?? "",
    images: p._count.images,
    createdAt: p.createdAt,
  };
}

/**
 * New in the price list and not yet ready to sell.
 *
 * "New" is NEW_FROM_SOURCE still open, not "created in the last 24 hours":
 * 33 products arrived in one run on 11 October because four tabs had not
 * been read for 35 days, and a day-based window would have shown them once
 * and then hidden a backlog nobody had worked through. The alert closes when
 * somebody deals with the product, which is the right clock.
 */
export async function getNewInPriceList(
  limit = 300,
): Promise<{ rows: (ProductLine & { fromLastSync: boolean })[]; fromLastSync: number }> {
  const [alerts, lastRun] = await Promise.all([
    db.inventoryAlert.findMany({
      where: { type: "NEW_FROM_SOURCE", isResolved: false, productId: { not: null } },
      select: { productId: true },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    db.inventorySyncRun.findFirst({
      where: { status: { in: ["SUCCESS", "NO_CHANGES"] } },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    }),
  ]);
  const ids = [...new Set(alerts.map((a) => a.productId).filter((id): id is string => id !== null))];
  if (ids.length === 0) return { rows: [], fromLastSync: 0 };
  const rows = await db.product.findMany({
    where: { id: { in: ids } },
    select: PRODUCT_LINE_SELECT,
    /* Newest first. The list is everything still waiting and not just the
       last run's output — 33 arrived in one run on 11 October because four
       tabs had gone unread for 35 days, and a window would have shown them
       once and then hidden the backlog — but what came in this morning is
       what somebody is looking for, so it is at the top and marked. */
    orderBy: [{ createdAt: "desc" }],
  });
  const since = lastRun?.startedAt ?? null;
  const out = rows.map((p) => ({
    ...toLine(p),
    fromLastSync: since !== null && p.createdAt >= since,
  }));
  return { rows: out, fromLastSync: out.filter((p) => p.fromLastSync).length };
}

/**
 * Products the price list has stopped carrying.
 *
 * Since 11 October these are off the site by query-time rule rather than by
 * anybody remembering — see PUBLIC_PRODUCT_WHERE — so this list is a
 * decision queue, not an emergency: sell the remaining stock, or take the
 * product out of the catalogue. It is ordered by what is sitting in it,
 * because a Miele washing machine at ₪10,500 with two units is a different
 * conversation from a ₪50 cable.
 */
export async function getDroppedFromPriceList(limit = 100): Promise<(ProductLine & { missingSince: Date })[]> {
  const rows = await db.product.findMany({
    where: { missingFromSourceSince: { not: null }, stockQty: { gt: 0 }, isPublished: true },
    select: { ...PRODUCT_LINE_SELECT, missingFromSourceSince: true },
    take: limit,
  });
  return rows
    .map((p) => ({ ...toLine(p), missingSince: p.missingFromSourceSince as Date }))
    .sort((a, b) => b.price * b.stockQty - a.price * a.stockQty);
}

export type PriceGap = {
  product: ProductLine;
  sheetPrice: number;
  /** The sheet row this product is bound to names a different model. */
  rowContradictsProduct: boolean;
  belowCost: boolean;
};

/**
 * Where the price on the site and the price in the sheet disagree.
 *
 * Read-only, and that is the point. The sync is not allowed to write a
 * price to a product that already exists — the rule that stopped a morning's
 * corrections being gone by the next morning — so every difference here is
 * one for a person to settle, and the owner settles them: "that is something
 * I decide, not an automatic action."
 *
 * The sheet's number is the second-lowest of its price columns, which is the
 * shop's selling price by the owner's own description: the lowest is the
 * cost, and the one above it is what we sell at. resolvedPrice() in
 * diff-engine.ts already computes exactly that, and this reads the figure it
 * recorded rather than deriving a second opinion.
 *
 * rowContradictsProduct is here because without it this list is dangerous.
 * Of 146 live differences measured on 11 October, 60 were products bound to
 * another product's row — a gas cooktop costing ₪590 was reading the row of
 * an induction cooktop costing ₪3,100 — and "accept the price list" on one
 * of those writes a different product's price onto a live page.
 */
export async function getPriceGaps(limit = 150): Promise<PriceGap[]> {
  /* The latest PRICE_CHANGED event per product. distinct on () is the
     cheapest way to say that in Postgres, and the set is small. */
  const latest = await db.$queryRaw<{ productId: string; sheetPrice: string }[]>`
    select distinct on (e."productId") e."productId" as "productId", e."newValue" as "sheetPrice"
    from "InventoryChangeEvent" e
    where e."changeType" = 'PRICE_CHANGED' and e."productId" is not null
    order by e."productId", e."createdAt" desc
  `;
  if (latest.length === 0) return [];

  const byId = new Map(latest.map((r) => [r.productId, Number(r.sheetPrice)]));
  const rows = await db.product.findMany({
    where: {
      id: { in: [...byId.keys()] },
      isPublished: true,
      stockQty: { gt: 0 },
      missingFromSourceSince: null,
    },
    select: { ...PRODUCT_LINE_SELECT, model: true, stockBreakdown: true },
  });

  const gaps: PriceGap[] = [];
  for (const p of rows) {
    const sheetPrice = byId.get(p.id);
    if (sheetPrice === undefined || !Number.isFinite(sheetPrice) || sheetPrice <= 0) continue;
    if (sheetPrice === p.price) continue; // already settled by hand
    gaps.push({
      product: toLine(p),
      sheetPrice,
      rowContradictsProduct: rowNamesAnotherModel(p.model, p.stockBreakdown),
      belowCost: p.supplierCost !== null && p.supplierCost > 0 && p.price > 0 && p.price < p.supplierCost,
    });
  }
  /* Biggest money first, and a contradicted row ahead of its size: that one
     is not a pricing decision at all, it is a product bound to the wrong
     line of the sheet, and it wants fixing rather than approving. */
  return gaps
    .sort((a, b) => {
      if (a.rowContradictsProduct !== b.rowContradictsProduct) return a.rowContradictsProduct ? -1 : 1;
      return Math.abs(b.product.price - b.sheetPrice) - Math.abs(a.product.price - a.sheetPrice);
    })
    .slice(0, limit);
}

/** Does the sheet row this product is bound to name a different model? */
function rowNamesAnotherModel(model: string | null, stockBreakdown: string | null): boolean {
  if (!model || !stockBreakdown) return false;
  const normalise = (v: string) => v.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const mine = normalise(model);
  if (!mine) return false;
  let rowModel: unknown;
  try {
    rowModel = (JSON.parse(stockBreakdown) as Record<string, unknown>)["דגם"];
  } catch {
    return false;
  }
  if (typeof rowModel !== "string") return false;
  const theirs = normalise(rowModel);
  /* Only a positive contradiction counts. A row with no model column, or one
     whose model is a bare number like "750", says nothing either way — and
     treating silence as a contradiction would flag half the catalogue. */
  if (!theirs || theirs.length < 4) return false;
  return theirs !== mine;
}

/**
 * In the price list, in stock, published — and with no photograph.
 *
 * Off the site all the same, because PUBLIC_PRODUCT_WHERE requires an
 * image, which is why this is its own list rather than a column on another
 * one: these are products the shop believes it is selling and no customer
 * can see. A photo is the only thing standing between them and the site.
 */
export async function getMissingImage(limit = 300): Promise<ProductLine[]> {
  const rows = await db.product.findMany({
    where: {
      source: PRICE_LIST_SOURCE,
      isPublished: true,
      stockQty: { gt: 0 },
      missingFromSourceSince: null,
      images: { none: {} },
    },
    select: PRODUCT_LINE_SELECT,
    orderBy: { price: "desc" },
    take: limit,
  });
  return rows.map(toLine);
}

export type ProblemReason =
  | "NOT_IN_PRICE_LIST"
  | "NEEDS_REVIEW"
  | "NO_PRICE"
  | "BELOW_COST"
  | "NO_SKU"
  | "SUMMARY_ROW";

export const PROBLEM_REASON_LABELS: Record<ProblemReason, string> = {
  NOT_IN_PRICE_LIST: "לא במחירון יותר",
  NEEDS_REVIEW: "נתוני מלאי לא עקביים",
  NO_PRICE: "אין מחיר מכירה",
  BELOW_COST: "מתחת למחיר העלות",
  NO_SKU: "אין מק״ט במחירון",
  SUMMARY_ROW: "נראה כמו שורת סיכום ולא מוצר",
};

export type ProblemProduct = ProductLine & { reasons: ProblemReason[] };

/**
 * Everything else that is wrong, one row per product.
 *
 * One list and not six, because a product is usually several of these at
 * once — a summary row has no model, no price and an implausible quantity —
 * and six lists of the same forty products is how a back office stops being
 * read. The reasons are collected onto the row instead.
 *
 * None of these is "needs a photo" or "just arrived": those have their own
 * tabs, and a product that is only missing content does not belong in a list
 * headed "problems".
 */
export async function getProblemProducts(limit = 300): Promise<ProblemProduct[]> {
  const rows = await db.product.findMany({
    where: {
      source: PRICE_LIST_SOURCE,
      /* Deliberately not "has no SKU". 835 products carry a synthetic one
         because the sheet gives them none, which is the sheet's habit and
         not a fault; including it put 454 rows in this list and buried the
         forty that are actually wrong. It is still annotated on a row that
         is here for another reason, because it is the thing that makes a
         product hard to match. */
      OR: [
        { missingFromSourceSince: { not: null }, stockQty: { gt: 0 } },
        { stockStatus: "NEEDS_REVIEW", stockQty: { gt: 0 } },
        { price: { lte: 0 }, stockQty: { gt: 0 } },
      ],
    },
    select: {
      ...PRODUCT_LINE_SELECT,
      model: true,
      stockStatus: true,
      isTemporarySku: true,
      missingFromSourceSince: true,
    },
    take: limit,
  });

  const out: ProblemProduct[] = [];
  for (const p of rows) {
    const reasons: ProblemReason[] = [];
    if (p.missingFromSourceSince !== null) reasons.push("NOT_IN_PRICE_LIST");
    if (p.stockStatus === "NEEDS_REVIEW") reasons.push("NEEDS_REVIEW");
    if (p.price <= 0) reasons.push("NO_PRICE");
    if (p.supplierCost !== null && p.supplierCost > 0 && p.price > 0 && p.price < p.supplierCost) {
      reasons.push("BELOW_COST");
    }
    if (p.isTemporarySku) reasons.push("NO_SKU");
    /* A row with no model, no price and a quantity in the dozens is a
       subtotal line the parser read as a product — "פרימייר" with 56 units
       at ₪0, "דלונגי" with 54. Said out loud because it is not a product
       with a problem, it is not a product. */
    if (!p.model && p.price <= 0 && p.stockQty > 20) reasons.push("SUMMARY_ROW");
    if (reasons.length === 0) continue;
    out.push({ ...toLine(p), reasons });
  }
  /* Worst first by what it is, then by what it is worth: a product that is
     being sold at a loss or has left the price list outranks one that is
     merely missing a SKU. */
  const weight = (r: ProblemReason[]) =>
    (r.includes("BELOW_COST") ? 400 : 0) +
    (r.includes("NOT_IN_PRICE_LIST") ? 300 : 0) +
    (r.includes("SUMMARY_ROW") ? 200 : 0) +
    (r.includes("NEEDS_REVIEW") ? 100 : 0) +
    r.length;
  return out.sort(
    (a, b) => weight(b.reasons) - weight(a.reasons) || b.price * b.stockQty - a.price * a.stockQty,
  );
}
