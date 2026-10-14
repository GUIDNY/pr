import "server-only";
import { db } from "@/lib/db";
import { normaliseSheetName } from "@/lib/inventory/sheet-map";
import { PUBLIC_PRODUCT_WHERE } from "@/lib/queries/products";
import { modelsAreTheSame } from "@/lib/inventory/import-guards";

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
export async function getNewInPriceList(limit = 300): Promise<{
  rows: (ProductLine & { fromLastSync: boolean })[];
  fromLastSync: number;
  /** How many are really waiting, which is not the same as how many are
      listed: the page read "300 waiting" because 300 was the take. The
      true number was 350. */
  total: number;
}> {
  const [alerts, lastRun] = await Promise.all([
    db.inventoryAlert.findMany({
      where: { type: "NEW_FROM_SOURCE", isResolved: false, productId: { not: null } },
      select: { productId: true },
      orderBy: { createdAt: "desc" },
      distinct: ["productId"],
    }),
    db.inventorySyncRun.findFirst({
      where: { status: { in: ["SUCCESS", "NO_CHANGES"] } },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    }),
  ]);
  const ids = alerts.map((a) => a.productId).filter((id): id is string => id !== null);
  if (ids.length === 0) return { rows: [], fromLastSync: 0, total: 0 };
  /* Not on the site already, asked here rather than trusted to the alert.
     The alert is resolved by reconcileNewFromSource, which runs inside a
     sync — and a sync is pressed by hand. So every other way a product goes
     live left its queue entry open: the admin form, a merge, the enrich
     endpoint's auto-publish. 59 of the 180 products this tab was listing as
     "waiting" were already being sold, which is how the tab came to
     disagree with "למה לא באתר" by 20 while overlapping it by 108 — two
     numbers that could not both be read.
     PUBLIC_PRODUCT_WHERE spread verbatim, so this cannot drift from what
     the shop shows no matter when the last sync ran. */
  const rows = await db.product.findMany({
    where: {
      id: { in: ids },
      NOT: PUBLIC_PRODUCT_WHERE,
      /* And it has stock. The owner's rule, said three times now: no stock
         means the product does not exist, so it is not work and it does not
         belong in a queue. 20 of these had none — a Bosch oven out of stock
         since 5 October among them — and they were the entire difference
         between this tab's count and "למה לא באתר", a gap that needed a
         footnote to explain. A number that needs a footnote is the wrong
         number.
         The queue entry is left open rather than resolved, so a product
         whose stock comes back reappears here on its own with nothing
         remembered and nothing lost. */
      stockQty: { gt: 0 },
    },
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
  return {
    rows: out.slice(0, limit),
    fromLastSync: out.filter((p) => p.fromLastSync).length,
    total: out.length,
  };
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
  /** A person set this price, so no sync will change it. */
  priceIsManual: boolean;
  /**
   * The price list's own figure is under the cost on its own row, so the
   * sync will not adopt it either (see adoptPrice in lib/inventory/sync.ts).
   * A gap that closes by itself needs both: nobody priced the product, and
   * the number offered is one we can sell at.
   */
  sheetPriceBelowCost: boolean;
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
  /* The latest PRICE_CHANGED event per product, but only from the run that
     last read this product's row.
     Without that second condition this list lies, and it did. A Siemens
     WM12N221IL showed the price list offering 10,200 against 2,790 on the
     page; the event saying so was written on 2 September, the product has
     synced many times since, and the sheet's figure today is 2,790 — the
     two numbers agree and have for weeks. 34 of 216 "live differences" were
     that: a difference that closed, remembered by the event that reported
     it. An event is a record of one run, not a statement about the sheet
     now, and the only events that describe the sheet now are the ones from
     the last run that read the row.
     createdAt >= lastExcelSyncAt is that test: the event is written inside
     the run that stamps lastExcelSyncAt, a few milliseconds after it, so an
     event from the current run passes and every earlier one fails.
     distinct on () is the cheapest way to say "latest per product" in
     Postgres, and the set is small. */
  const latest = await db.$queryRaw<{ productId: string; sheetPrice: string }[]>`
    select distinct on (e."productId") e."productId" as "productId", e."newValue" as "sheetPrice"
    from "InventoryChangeEvent" e
    join "Product" p on p.id = e."productId"
    where e."changeType" = 'PRICE_CHANGED'
      and e."productId" is not null
      and p."lastExcelSyncAt" is not null
      and e."createdAt" >= p."lastExcelSyncAt"
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
    select: { ...PRODUCT_LINE_SELECT, model: true, stockBreakdown: true, priceManualAt: true },
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
      /* The difference between a row that is waiting for a decision and a
         row that will settle itself. Since 11 October the sync adopts the
         price list's figure for any product nobody has priced, so most of
         this list closes on the next run; what stays is the handful a person
         chose, where the sheet's number is a suggestion and nothing more. */
      priceIsManual: p.priceManualAt !== null,
      sheetPriceBelowCost:
        p.supplierCost !== null && p.supplierCost > 0 && sheetPrice < p.supplierCost,
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

/**
 * Is this product bound to a row that belongs to a different product?
 *
 * Two conditions, and the second one is why this function was rewritten
 * before it ever shipped a warning. A differing model number alone flags 296
 * of the 1,259 live products — 23% — and a sample of fourteen showed
 * thirteen were the same product written loosely by the supplier:
 * ROEN8205IL as "8205", TSOFTCM108BIL as "CM108BI", 55QNED82A6A as
 * "55 QN 82A6A", BKIC3C26FIS as "BKIC3C26PFIS". A page that cries wolf 296
 * times is a page nobody reads, which is the failure this whole screen
 * exists to end.
 *
 * So the row must also carry no SKU of its own. A row with a SKU was matched
 * on it — findExistingProduct looks the SKU up directly — and that match
 * cannot slip when the supplier re-sorts the sheet. Only a SKU-less row is
 * matched by fingerprint or, for sixteen products, by position alone, and
 * only there does a contradicting model mean the binding moved. That
 * narrows it to 75, and the one found by hand is in them: a Candy ceramic
 * cooktop reading a row whose model is MGH90GB and whose description says
 * "5 burners / 90cm / side turbo" — a gas cooktop.
 */
function rowNamesAnotherModel(model: string | null, stockBreakdown: string | null): boolean {
  if (!model || !stockBreakdown) return false;
  const normalise = (v: string) => v.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const mine = normalise(model);
  if (!mine) return false;

  let row: Record<string, unknown>;
  try {
    row = JSON.parse(stockBreakdown) as Record<string, unknown>;
  } catch {
    return false;
  }

  /* The sheet spells the header both ways, and either one means the row
     identifies itself. */
  const rowSku = [row["מק'ט"], row["מקט"], row['מק"ט']].find(
    (v) => typeof v === "string" || typeof v === "number",
  );
  if (rowSku !== undefined && String(rowSku).trim() !== "") return false;

  const rowModel = row["דגם"];
  if (typeof rowModel !== "string") return false;
  const theirs = normalise(rowModel);
  /* A row whose model is a bare number like "750" says nothing either way,
     and treating silence as a contradiction is the same false alarm one
     layer down. */
  if (!theirs || theirs.length < 4) return false;
  return theirs !== mine;
}

/**
 * In the price list, in stock — and with no photograph.
 *
 * Off the site all the same, because PUBLIC_PRODUCT_WHERE requires an
 * image, which is why this is its own list rather than a column on another
 * one: these are products the shop believes it is selling and no customer
 * can see. A photo is the only thing standing between them and the site.
 *
 * Deliberately not filtered to isPublished, and that is the correction.
 * Requiring it showed 52 of the 191 products in this state and hid the
 * rest — every one a product with stock and no photo, which is the same
 * piece of work whether somebody has pressed publish yet or not. Worse,
 * the hidden ones were on no tab at all: they are not "new", not "a
 * problem", and not on the site, so a count that was supposed to account
 * for every product in stock came up 132 short with nowhere to look.
 *
 * What is missing *besides* the photograph is reported on the row, and the
 * states went through the owner twice. The first version said "photo +
 * publish" on all 139 unpublished rows; 91 of those have never been
 * enriched — their title is still the sheet's raw "{brand} {model}" — so
 * publishing one would put a blank page on the site the moment a photo
 * arrived. The second version said it on 20, and he answered the thing
 * that was actually wrong with it: you do not publish a product with no
 * picture. Pressing publish on a photo-less product changes nothing a
 * customer can see, so it was never a job, it was a field.
 *
 * reconcileAutoPublish in lib/inventory/sync.ts settles that: an enriched
 * product still in its arrival queue publishes itself the moment it has a
 * photograph. So "photo + publish" now means the one case where that will
 * not happen — a product somebody took off the site deliberately, where a
 * photograph alone will not bring it back.
 */
export type ImageBlocker =
  /** The photograph is the only thing. Either it is published already, or
      it will publish itself when the photo lands. */
  | "PHOTO"
  /** Never enriched: no real title, no description, often a department
      rather than a leaf category. Needs the enrichment pass first. */
  | "PHOTO_AND_CONTENT"
  /** Content written but not yet approved — NEEDS_REVIEW and its
      relatives. A person has to confirm it before it goes in front of a
      customer, so the photograph is not enough on its own. */
  | "PHOTO_AND_REVIEW"
  /** Taken off the site by hand: enriched, out of the arrival queue, and
      unpublished anyway. The photo will not republish it, by design. */
  | "PHOTO_AND_PUBLISH"
  /** Flagged as a conflict — duplicate, model, spec, colour. A person has
      to decide before this is a product at all. */
  | "PHOTO_AND_CONFLICT";

export const IMAGE_BLOCKER_LABELS: Record<ImageBlocker, string> = {
  PHOTO: "תמונה בלבד",
  PHOTO_AND_CONTENT: "תמונה + תוכן",
  PHOTO_AND_REVIEW: "תמונה + אישור תוכן",
  PHOTO_AND_PUBLISH: "תמונה + פרסום (הוסתר ידנית)",
  PHOTO_AND_CONFLICT: "תמונה + הכרעה בהתנגשות",
};

export const IMAGE_BLOCKER_HINTS: Record<ImageBlocker, string> = {
  PHOTO: "עולה לאתר לבד ברגע שנוספת תמונה — אין מה ללחוץ",
  PHOTO_AND_CONTENT: "אין לו עוד כותרת, תיאור וקטגוריה — ההעשרה לא הגיעה אליו",
  PHOTO_AND_REVIEW: "התוכן נכתב וממתין לאישור בעמוד המוצר",
  PHOTO_AND_PUBLISH: "מישהו הוריד אותו מהאתר בכוונה — תמונה לא תחזיר אותו",
  PHOTO_AND_CONFLICT: "סומן התנגשות (כפילות / דגם / מפרט) — צריך הכרעה",
};

export async function getMissingImage(
  limit = 300,
): Promise<(ProductLine & { blocker: ImageBlocker })[]> {
  const rows = await db.product.findMany({
    where: {
      source: PRICE_LIST_SOURCE,
      stockQty: { gt: 0 },
      missingFromSourceSince: null,
      images: { none: {} },
    },
    select: {
      ...PRODUCT_LINE_SELECT,
      isPublished: true,
      enrichmentStatus: true,
      /* Whether it is still in the arrival queue, which is what decides
         between "will publish itself" and "somebody hid this". Same
         evidence reconcileAutoPublish uses, read the same way. */
      /* Two questions off one relation, because Prisma selects a relation
         once: is it still in the arrival queue (NEW_FROM_SOURCE), and has
         somebody objected to it (QUARANTINE_ALERT_TYPES). The objection
         outranks the missing photograph — it is the one state where
         finding a picture is the wrong next move. */
      alerts: {
        where: {
          type: { in: ["NEW_FROM_SOURCE", ...QUARANTINE_ALERT_TYPES] },
          isResolved: false,
        },
        select: { type: true },
      },
    },
    orderBy: { price: "desc" },
    take: limit,
  });
  return rows.map((p) => {
    const status = p.enrichmentStatus ?? "";
    /* The conflict first, even on a published product: it is the one state
       where adding a photograph is the wrong next move. */
    const quarantined = p.alerts.some((a) =>
      (QUARANTINE_ALERT_TYPES as readonly string[]).includes(a.type),
    );
    const isNew = p.alerts.some((a) => a.type === "NEW_FROM_SOURCE");
    const blocker: ImageBlocker = quarantined
      ? "PHOTO_AND_CONFLICT"
      : p.isPublished
        ? "PHOTO"
        : status === "NOT_ENRICHED" || status === ""
          ? "PHOTO_AND_CONTENT"
          : status !== "ENRICHED"
            ? "PHOTO_AND_REVIEW"
            : isNew
              ? "PHOTO"
              : "PHOTO_AND_PUBLISH";
    return { ...toLine(p), blocker };
  });
}

/**
 * Why a product with stock is not on the site — one reason per product.
 *
 * This exists because the back office could not account for its own
 * headline number. "1,494 in stock" was followed by six tabs that
 * overlapped each other and a queue (NEW_FROM_SOURCE) that is a label
 * rather than a place, so adding the tabs up came to more than 1,494 while
 * 132 products appeared on none of them. The owner asked the only question
 * that settles it: show me all of them, and why each one is not published.
 *
 * So the reasons are a ladder and not a set: every in-stock product gets
 * exactly one, the first that applies, and the counts add up to the total
 * by construction. The order is the order the work has to happen in — a
 * product with no price cannot be sold whatever else is true of it, and a
 * product with no photograph is not going on the site even once it has
 * one.
 *
 * ON_SITE is in the ladder deliberately: it is the branch that proves the
 * other six are exhaustive, and it is tested against PUBLIC_PRODUCT_WHERE
 * and nothing else, so this page cannot drift from what the shop shows.
 */
export type OffSiteReason =
  | "NO_PRICE"
  | "STOCK_NOT_TRUSTED"
  | "NO_IMAGE"
  | "DO_NOT_PUBLISH"
  | "CONTENT_NEEDS_REVIEW"
  | "NOT_PUBLISHED";

export const OFF_SITE_LABELS: Record<OffSiteReason, string> = {
  NO_PRICE: "אין מחיר מכירה",
  STOCK_NOT_TRUSTED: "נתוני מלאי לא עקביים",
  NO_IMAGE: "חסרה תמונה",
  DO_NOT_PUBLISH: "סומן לא לפרסם",
  CONTENT_NEEDS_REVIEW: "דורש בדיקת תוכן",
  NOT_PUBLISHED: "הוסתר מהאתר ידנית",
};

/** What closes it, in the imperative, because the label alone does not say. */
export const OFF_SITE_ACTIONS: Record<OffSiteReason, string> = {
  NO_PRICE: "המחירון לא נושא מחיר לשורה הזו — צריך להזין מחיר בעמוד המוצר",
  STOCK_NOT_TRUSTED: "לבדוק את הכמות מול הגיליון ולאשר",
  NO_IMAGE: "להוסיף תמונה אחת — ואם כתוב גם ׳לא מפורסם׳, גם ללחוץ פרסום",
  DO_NOT_PUBLISH: "מישהו סימן התנגשות (כפילות / דגם / מפרט) — להכריע ולהסיר את הסימון",
  CONTENT_NEEDS_REVIEW: "לאשר את התוכן בעמוד המוצר",
  /* Since reconcileAutoPublish, a product that has everything publishes
     itself — so anything still here was taken off the site on purpose, or
     is being held back for a reason outside these six fields. */
  NOT_PUBLISHED: "יש לו הכל ובכל זאת הוא מוסתר — להחליט אם להחזיר אותו לאתר",
};

/**
 * The quarantine flags, spelled out.
 *
 * enrichmentStatus carries the kind of the objection and nothing else —
 * MODEL_CONFLICT_DO_NOT_PUBLISH says a model number was not believed, not
 * which one or why. So "סומן לא לפרסם" was a dead end on the page: a
 * person could see that something had been decided and not what. This is
 * half the answer, and the open alerts on the product are the other half.
 */
const QUARANTINE_REASONS: Record<string, string> = {
  NEEDS_REVIEW: "התוכן נכתב אוטומטית ולא אושר על ידי אדם",
};

/**
 * An objection somebody raised about this record, as opposed to a field it
 * is missing.
 *
 * This used to be read off `enrichmentStatus` — `status.includes("DO_NOT_PUBLISH")`
 * — and that was the wrong column to read. `enrichmentStatus` is a
 * three-value lifecycle (NOT_ENRICHED → ENRICHED | NEEDS_REVIEW) declared
 * in enums.ts, and the strings this tested for were never in it: several
 * agents had each invented their own vocabulary in the same column, 209
 * products across twelve values — DUPLICATE_DO_NOT_PUBLISH,
 * MODEL_CONFLICT_DO_NOT_PUBLISH, NEEDS_MODEL_VERIFICATION,
 * ENRICHED_NIGHT_NO_IMAGE_YET. Each one is a lie in the TypeScript union, a
 * blank cell wherever ENRICHMENT_STATUS_LABELS is indexed, and a silent
 * fall-through in every `=== "ENRICHED"` branch in the sync.
 *
 * The reason a record is held is not a lifecycle state, which is why it
 * never fitted: it has an author, a date, a body of text and an end, and
 * InventoryAlert has all four. So the column is back to its three values
 * and the objection lives in an alert, where the page was already reading
 * the detail from anyway.
 */
export const QUARANTINE_ALERT_TYPES = ["MANUAL_URGENT", "ROW_NAMES_ANOTHER_MODEL"] as const;

export type OffSiteProduct = ProductLine & {
  reason: OffSiteReason;
  /** Waiting in the "new from the sheet" queue as well. An overlap, not a
      seventh reason — which is the thing the two tabs never said. */
  isNew: boolean;
  /** The raw flag, so the page can say which objection this is. */
  status: string;
  /**
   * Why this one is held, in Hebrew: the flag spelled out, then whatever
   * the open alerts on the product actually say. The alert messages are
   * where the detail lives — "קוד הדגם WFS9014GBB אינו קיים במקור רשמי"
   * is an answer; "סומן לא לפרסם" is not.
   */
  why: string[];
  /**
   * Whether publishing it from this page is honest — every public gate
   * except the flag is already satisfied, so the flag is the only thing
   * between it and the site.
   */
  canPublish: boolean;
};

export async function getOffSiteProducts(): Promise<{
  rows: OffSiteProduct[];
  inStock: number;
  onSite: number;
  byReason: { reason: OffSiteReason; count: number; value: number }[];
}> {
  const [products, newIds, openAlerts] = await Promise.all([
    db.product.findMany({
      where: { source: PRICE_LIST_SOURCE, stockQty: { gt: 0 }, missingFromSourceSince: null },
      select: {
        ...PRODUCT_LINE_SELECT,
        isPublished: true,
        stockStatus: true,
        enrichmentStatus: true,
        /* The objection, if there is one. See QUARANTINE_ALERT_TYPES —
           this is the evidence that used to be dug out of
           enrichmentStatus with a substring test. */
        alerts: {
          where: { type: { in: [...QUARANTINE_ALERT_TYPES] }, isResolved: false },
          select: { id: true },
          take: 1,
        },
      },
    }),
    db.inventoryAlert
      .findMany({
        where: { type: "NEW_FROM_SOURCE", isResolved: false, productId: { not: null } },
        select: { productId: true },
        distinct: ["productId"],
      })
      .then((rows) => new Set(rows.map((r) => r.productId))),
    /* The detail behind a flag. NEW_FROM_SOURCE and MISSING_IMAGE are
       excluded because they repeat what the row's own reason already says
       — "waiting for a title, a category, a photo" under a line that reads
       "no photograph" is noise, and the point of this is to answer a
       question the label could not. */
    db.inventoryAlert.findMany({
      where: {
        isResolved: false,
        productId: { not: null },
        type: { notIn: ["NEW_FROM_SOURCE", "MISSING_IMAGE"] },
      },
      select: { productId: true, message: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const alertsByProduct = new Map<string, string[]>();
  for (const a of openAlerts) {
    if (!a.productId) continue;
    const bucket = alertsByProduct.get(a.productId);
    /* Three at most. One product carries nine open alerts and a cell with
       nine sentences in it is read as carefully as a cell with none. */
    if (bucket) {
      if (bucket.length < 3) bucket.push(a.message);
    } else alertsByProduct.set(a.productId, [a.message]);
  }

  const rows: OffSiteProduct[] = [];
  let onSite = 0;
  for (const p of products) {
    /* PUBLIC_PRODUCT_WHERE, read field by field. stockQty and
       missingFromSourceSince are already in the where above. */
    const live =
      p.isPublished &&
      p._count.images > 0 &&
      p.stockStatus !== "NEEDS_REVIEW" &&
      p.price > 0;
    if (live) {
      onSite += 1;
      continue;
    }
    const reason: OffSiteReason =
      p.price <= 0
        ? "NO_PRICE"
        : p.stockStatus === "NEEDS_REVIEW"
          ? "STOCK_NOT_TRUSTED"
          : p._count.images === 0
            ? "NO_IMAGE"
            : p.alerts.length > 0
              ? "DO_NOT_PUBLISH"
              : p.enrichmentStatus === "NEEDS_REVIEW"
                ? "CONTENT_NEEDS_REVIEW"
                : "NOT_PUBLISHED";

    const status = p.enrichmentStatus ?? "";
    const why = [
      ...(QUARANTINE_REASONS[status] ? [QUARANTINE_REASONS[status]] : []),
      ...(alertsByProduct.get(p.id) ?? []),
    ];
    /* The three reasons where the flag is the only thing left. Everything
       above them in the ladder is a real public gate — publishing a
       product with no photograph or no price would put it nowhere and say
       it had been dealt with. */
    const canPublish =
      reason === "DO_NOT_PUBLISH" ||
      reason === "CONTENT_NEEDS_REVIEW" ||
      reason === "NOT_PUBLISHED";

    rows.push({ ...toLine(p), reason, isNew: newIds.has(p.id), status, why, canPublish });
  }

  const order: OffSiteReason[] = [
    "NO_PRICE",
    "STOCK_NOT_TRUSTED",
    "NO_IMAGE",
    "DO_NOT_PUBLISH",
    "CONTENT_NEEDS_REVIEW",
    "NOT_PUBLISHED",
  ];
  const rank = new Map(order.map((r, i) => [r, i]));
  rows.sort(
    (a, b) =>
      (rank.get(a.reason) ?? 9) - (rank.get(b.reason) ?? 9) ||
      b.price * b.stockQty - a.price * a.stockQty,
  );

  const byReason = order
    .map((reason) => {
      const mine = rows.filter((r) => r.reason === reason);
      return {
        reason,
        count: mine.length,
        value: mine.reduce((s, r) => s + r.price * r.stockQty, 0),
      };
    })
    .filter((g) => g.count > 0);

  return { rows, inStock: products.length, onSite, byReason };
}

export type DuplicatePair = {
  /** The record the price list no longer points at. */
  orphan: ProductLine & { enriched: boolean; colour: string };
  /** The record holding the sheet row now. */
  live: ProductLine & { enriched: boolean; quarantined: boolean; colour: string };
  model: string;
  /** Stock counted twice while both records carry it. */
  ghostValue: number;
};

/**
 * The same product in two records, because the supplier renumbered its row.
 *
 * 0690 became 0855 for a Sharp fridge, 0660 became 130016 for a Bosch
 * dryer, 150457 became 0150457 for a Gorenje oven — that last one only a
 * leading zero. findExistingProduct matched the row's position, saw a
 * different SKU and refused the match, so a second record was created and
 * the first was reported as gone from a price list that still carried it.
 * 37 pairs, ₪253,940 of stock counted twice.
 *
 * The import no longer does this — a position match whose model agrees is
 * accepted as the same product under a new number, see modelsAreTheSame.
 *
 * Nor is the merge a decision any more. 58 pairs were merged by hand over
 * three rounds, every one of them the same way, and on 12 October the
 * owner made it the rule: always keep the record holding the row, get rid
 * of the other. reconcileDuplicateRowClaims in lib/inventory/sync.ts does
 * that on every sync.
 *
 * So what is left here is the one case it refuses: **more than one live
 * record passes the colour test**, which means picking a survivor would be
 * picking arbitrarily. That is the Miele H 2861 BP in grey, black and
 * stainless, and it is a real catalogue of variants, not a duplicate. The
 * list exists so those stay visible instead of being quietly skipped.
 */
export async function getDuplicatePairs(limit = 60): Promise<DuplicatePair[]> {
  const [orphans, live] = await Promise.all([
    db.product.findMany({
      where: {
        source: PRICE_LIST_SOURCE,
        missingFromSourceSince: { not: null },
        stockQty: { gt: 0 },
        model: { not: null },
        /* Not one that has already been merged. A merge retires the losing
           record and releases its claim on the sheet row — that release is
           what stops the matcher seeing two claimants — and the retired
           record then looks exactly like a fresh orphan: out of the price
           list, with stock, with a model that matches its surviving twin.
           So 13 of the 57 pairs on this page were pairs somebody had
           already decided, offered back for deciding again. A record with
           no row position is one a person deliberately detached; nothing
           else in the sync ever clears it. */
        sourceRowRef: { not: null },
      },
      select: { ...PRODUCT_LINE_SELECT, model: true, enrichmentStatus: true, colorName: true },
    }),
    db.product.findMany({
      where: {
        source: PRICE_LIST_SOURCE,
        missingFromSourceSince: null,
        model: { not: null },
      },
      select: { ...PRODUCT_LINE_SELECT, model: true, enrichmentStatus: true, colorName: true },
    }),
  ]);

  const key = (m: string | null) => (m ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  /* Every live record per model, not the first: a model can legitimately
     appear more than once, and picking one arbitrarily is how a white oven
     gets paired with a stainless one. */
  const liveByModel = new Map<string, (typeof live)[number][]>();
  for (const p of live) {
    const k = key(p.model);
    /* Four characters, the same floor modelsAreTheSame uses: a bare "750"
       or "85" would pair half the catalogue with itself. */
    if (k.length < 4) continue;
    const bucket = liveByModel.get(k);
    if (bucket) bucket.push(p);
    else liveByModel.set(k, [p]);
  }

  const pairs: DuplicatePair[] = [];
  for (const o of orphans) {
    const k = key(o.model);
    if (k.length < 4) continue;
    /* The colour has to agree, and this is the correction that matters.
       Matching on the model alone put real colour variants in this list:
       a Bosch HBG537ES4Y in white against the same oven in stainless, a
       Crystal MGH66GW in black induction against the same hob in white
       glass. Those are two products and always were, and offering them for
       merging is offering to delete one of them. The sheet names the finish
       in its own צבע column and the enrichment copies it to colorName, so
       when both sides say something they have to say the same thing;
       silence on either side is not evidence either way and still pairs. */
    const candidates = (liveByModel.get(k) ?? []).filter((c) => {
      if (c.id === o.id) return false;
      const a = (o.colorName ?? "").trim();
      const b = (c.colorName ?? "").trim();
      if (a === "" || b === "") return true;
      return a === b;
    });
    /* Exactly one and the sync has already merged it, so it is not here.
       None and there is no pair. Only an ambiguous one survives to this
       page — the same test reconcileDuplicateRowClaims refuses on, read the
       same way, so the two cannot disagree about what is automatic. */
    if (candidates.length < 2) continue;
    const twin = candidates[0];
    pairs.push({
      orphan: {
        ...toLine(o),
        enriched: o.enrichmentStatus === "ENRICHED",
        colour: (o.colorName ?? "").trim(),
      },
      live: {
        ...toLine(twin),
        enriched: twin.enrichmentStatus === "ENRICHED",
        /* NEEDS_REVIEW, not a substring of an invented status — see
           QUARANTINE_ALERT_TYPES. Read off the lifecycle column that
           actually exists: a survivor nobody has approved is one a person
           still has to look at before it is treated as the keeper. */
        quarantined: twin.enrichmentStatus === "NEEDS_REVIEW",
        colour: (twin.colorName ?? "").trim(),
      },
      model: o.model ?? "",
      ghostValue: o.price * o.stockQty,
    });
  }
  return pairs.sort((a, b) => b.ghostValue - a.ghostValue).slice(0, limit);
}

/**
 * Every product a customer can actually buy right now.
 *
 * The one list in the back office that answers "what are we selling",
 * rather than "what is wrong". The inventory summary bar counts 1,624
 * products with stock, the shop serves 1,225, and until this existed there
 * was nowhere to see the second number as a list — the gap had to be asked
 * for and measured each time.
 *
 * PUBLIC_PRODUCT_WHERE verbatim, not a copy of its conditions. That
 * constant is what the storefront, the search, the Finder, the compare
 * page and the Merchant feed all read; a second hand-rolled version of it
 * here would be the seventh place to drift, which is the exact rot the
 * comment on that constant describes.
 */
export async function getLiveProducts(): Promise<ProductLine[]> {
  const rows = await db.product.findMany({
    where: PUBLIC_PRODUCT_WHERE,
    select: PRODUCT_LINE_SELECT,
    orderBy: [{ category: { name: "asc" } }, { title: "asc" }],
  });
  return rows.map(toLine);
}


/**
 * One sheet row, two records — all of them, whatever the models say.
 *
 * getDuplicatePairs above pairs on the model and the colour, and that is
 * the right test when the question is "are these the same product". It is
 * the wrong test here, because the row already answered it: a row of the
 * price list is one product, and the supplier does not sell two things on
 * one line. So this asks nothing about the records and only about the
 * row.
 *
 * It exists because the owner read the earlier version of this page and
 * said the obvious thing: why is this only on a page. 78 of these were
 * sitting in the catalogue with nothing naming them. They are not all
 * damage — most are the supplier putting a different product on a row it
 * had finished with, which is ordinary turnover, and the stale position on
 * the old record is only bookkeeping nobody cleared. But some are the real
 * thing: a Klipsch Flexus CORE 300 is on the site at ₪1,990 while its twin
 * sits off it at ₪3,999 with seven units.
 *
 * Telling those apart is a person's job and a glance each, so the pair is
 * shown side by side rather than judged. What the page must not do is hide
 * them because a model string disagreed.
 */
export type RowCollision = {
  sheetName: string;
  rowRef: number;
  dropped: ProductLine & { model: string; droppedAt: Date };
  holder: ProductLine & { model: string };
  /** Can the two records be the same product? See the sort below. */
  sameProduct: boolean;
  /**
   * The last stock the row reported before this record lost it, priced at
   * the last price it carried. **Not money sitting off the site**, and the
   * field was called strandedValue and sorted on until 14 October, which is
   * the whole reason this section read as noise.
   *
   * Every record here is one the price list has dropped, so its stockQty
   * stopped being updated on the day it was dropped — anywhere from 23
   * August to yesterday. On ten of the 69 pairs it is the holder's own
   * current stock to the unit, because both readings came off the same row:
   * the SOMO air conditioner at the top of the list showed "7 units ·
   * ₪1,000 · ₪7,000 stuck" against a Tornado holding the row with the same
   * seven units. That is the holder's stock counted twice.
   */
  lastReportedValue: number;
};

export async function getRowCollisions(limit = 200): Promise<RowCollision[]> {
  const [dropped, held] = await Promise.all([
    db.product.findMany({
      where: {
        source: PRICE_LIST_SOURCE,
        missingFromSourceSince: { not: null },
        sourceSheet: { not: null },
        sourceRowRef: { not: null },
      },
      select: { ...PRODUCT_LINE_SELECT, model: true, sourceRowRef: true, missingFromSourceSince: true },
    }),
    db.product.findMany({
      where: {
        source: PRICE_LIST_SOURCE,
        missingFromSourceSince: null,
        sourceSheet: { not: null },
        sourceRowRef: { not: null },
      },
      select: { ...PRODUCT_LINE_SELECT, model: true, sourceRowRef: true },
    }),
  ]);

  const key = (sheet: string | null, row: number | null) => `${sheet}\u0000${row}`;
  const holderByRow = new Map(held.map((p) => [key(p.sourceSheet, p.sourceRowRef), p]));

  const out: RowCollision[] = [];
  for (const d of dropped) {
    const holder = holderByRow.get(key(d.sourceSheet, d.sourceRowRef));
    if (!holder || holder.id === d.id) continue;
    out.push({
      sheetName: (d.sourceSheet ?? "").trim(),
      rowRef: d.sourceRowRef ?? 0,
      dropped: {
        ...toLine(d),
        model: d.model ?? "",
        droppedAt: d.missingFromSourceSince as Date,
      },
      holder: { ...toLine(holder), model: holder.model ?? "" },
      /* modelsAreTheSame and not modelsCanBeTheSame, which is what this
         asked on the first attempt and got wrong in the most visible place
         there is: the top row of the list. That one answers "could these
         differ" and returns true when either side is empty, because its job
         is to refuse a match only on evidence. bareModel keeps Latin
         alphanumerics, so a model column holding Hebrew — the SOMO air
         conditioner's "עילי אינוורטר" — reads as empty and paired with a
         Tornado SUMO-INV-12X-EU under a badge saying they are the same
         product. Asserting sameness needs the test that demands both sides
         speak, which is the distinction its own doc comment draws. */
      sameProduct: modelsAreTheSame(d.model, holder.model),
      lastReportedValue: d.price * d.stockQty,
    });
  }
  /* Same product first, and that is a correction rather than a preference.
     The list was sorted by the money figure, and of the 69 pairs exactly
     one is the same product on both sides — a Blomberg BT6992W under 0455
     and 136992 — whose figure is 0 because the dropped record holds no
     stock. So the single real finding sorted last, under 68 rows of
     ordinary turnover ranked by a number that cannot be money. Within each
     group the figure still orders, because among real duplicates it is at
     least evidence about size. */
  return out
    .sort((a, b) =>
      a.sameProduct === b.sameProduct
        ? b.lastReportedValue - a.lastReportedValue
        : Number(b.sameProduct) - Number(a.sameProduct)
    )
    .slice(0, limit);
}
