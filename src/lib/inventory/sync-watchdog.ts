import "server-only";
import { db } from "@/lib/db";
import { underpricedReason, UNDERPRICED_LABELS, type UnderpricedReason } from "@/lib/inventory/underpriced";
import {
  openHoursBetween,
  missedReportsBetween,
  STALE_AFTER_MISSED_REPORTS,
} from "@/lib/inventory/office-hours";
import { PUBLIC_PRODUCT_WHERE } from "@/lib/queries/products";
import {
  rowBindingLooksForeign,
  titleNamesAnotherModel,
} from "@/lib/inventory/import-guards";
import {
  pairReplacements,
  type ReplacedProduct,
  type RunCasualty,
  type RunArrival,
} from "@/lib/inventory/replaced-products";

import {
  findDuplicateListings,
  duplicateMessage,
  type DuplicateGroup,
} from "./duplicate-listings";

export type { ReplacedProduct };

/**
 * Are the price sheets still arriving?
 *
 * Every other alert in this system is written by a sync run, which is fine
 * for "this row has no model" and useless for "no sync happened", because a
 * run that never starts writes nothing. On 23 September the upload began
 * failing — Supabase Storage was restricted over an egress quota — the
 * failure was upstream of the run, and so nothing anywhere recorded it. The
 * shop sold 1,385 products against four-day-old stock and every screen in
 * the back office looked completely normal.
 *
 * Worth being precise about what went wrong, because the obvious reading is
 * the wrong one. The ingest was right to fail: the sync runs in a separate
 * request minutes later and reads the workbook back from storage, so a sheet
 * that could not be stored is a sheet the sync cannot have. Storage is the
 * handoff between the two halves, not an accidental dependency, and
 * "continue anyway" would only have produced a sync quietly re-reading last
 * week's prices. The defect was never the failure. It was the silence.
 *
 * So this runs on its own schedule, outside everything it watches, and
 * touches nothing but the database — no storage, no third party — so the
 * outages it reports cannot take it down with them.
 */

/**
 * The measure is when the agent was last *heard from*, not when a sync last
 * succeeded, and the difference matters.
 *
 * A supplier who changes nothing for two days is a supplier whose sheets are
 * read twice a day and whose sync is correctly skipped. Watching for runs
 * would cry wolf every quiet weekend, and an alert that cries wolf is an
 * alert the back office learns to scroll past, taking the next real one with
 * it.
 *
 * Getting that right needs both timestamps, and the first version of this
 * used only the first. `uploadedAt` moves when a workbook's bytes differ —
 * the agent compares sha256 and sends nothing when they match, because three
 * identical files pushed twice a day is the egress that took Storage down in
 * September. So a quiet supplier and a dead agent looked identical from
 * here, and on 30 September a perfectly healthy system was eighteen hours
 * from the false alarm this comment was written to rule out.
 *
 * `lastScannedAt` is the other half. The sync has always stamped it, but
 * only on a run that had something to sync, which made it a second copy of
 * `uploadedAt` rather than the independent signal its own description in
 * the schema promises — "last time we checked the content hash, whether or
 * not it had changed". /api/inventory/heartbeat is what makes that true:
 * the agent stamps it on every run that read the sheets and matched them.
 *
 * Either one is proof of the same thing — the machine inside the company
 * network read the files and reached this server. That is the whole chain
 * that broke in September, and the only thing that stops it is something
 * genuinely wrong.
 */
export type SyncFreshness = {
  stale: boolean;
  /** Last contact of any kind: a sheet stored, or a run that read them and
      found them unchanged. This is what `stale` is measured against. */
  lastSeenAt: Date | null;
  /** Last time a workbook's bytes actually differed. Older than `lastSeenAt`
      whenever the supplier is simply quiet, which is not a fault. */
  lastUploadAt: Date | null;
  /** Hours on the clock since the last report. What a person reads. */
  hoursSince: number | null;
  /** Of those, the ones in which the agent could have reported at all.
      Printed next to the wall clock; it is no longer what decides. */
  openHoursSince: number | null;
  /** Scheduled runs the agent could have made since the last contact and
      did not. What `stale` is measured against — see
      STALE_AFTER_MISSED_REPORTS for why this and not hours. */
  missedReports: number | null;
  missedThreshold: number;
  /** One missed run: worth showing, not worth a CRITICAL. */
  lagging: boolean;
  lastRunFailed: boolean;
};

function newest(dates: (Date | null)[]): Date | null {
  const times = dates.filter((d): d is Date => d !== null).map((d) => d.getTime());
  return times.length > 0 ? new Date(Math.max(...times)) : null;
}

export async function checkSyncFreshness(): Promise<SyncFreshness> {
  const [sources, lastRun] = await Promise.all([
    /* All of them rather than the newest row, because the two timestamps
       live on different sources: a workbook that changed today carries a
       fresh `uploadedAt` and a stale `lastScannedAt`, and the other way
       round for one the supplier has not touched. There are three. */
    db.inventorySource.findMany({
      where: { isActive: true },
      select: { uploadedAt: true, lastScannedAt: true },
    }),
    db.inventorySyncRun.findFirst({
      where: { status: { in: ["SUCCESS", "FAILED", "NO_CHANGES"] } },
      orderBy: { startedAt: "desc" },
      select: { status: true },
    }),
  ]);

  const lastUploadAt = newest(sources.map((s) => s.uploadedAt));
  const at = newest([lastUploadAt, ...sources.map((s) => s.lastScannedAt)]);
  const now = new Date();
  const hoursSince = at ? (now.getTime() - at.getTime()) / 3_600_000 : null;
  /* The weekend does not count. The office powers its file server down from
     Friday afternoon to Sunday morning, so a 45-hour silence across it is
     the system working — and measuring it on a wall clock raised a CRITICAL
     alert every Saturday on a healthy shop. */
  const openHoursSince = at ? openHoursBetween(at, now) : null;
  const missedReports = at ? missedReportsBetween(at, now) : null;
  /* Never having heard from it is stale too. A shop with products on the
     site and no sheet on record is not a state to treat as "early days". */
  const stale = missedReports === null || missedReports >= STALE_AFTER_MISSED_REPORTS;

  return {
    stale,
    lastSeenAt: at,
    lastUploadAt,
    hoursSince,
    openHoursSince,
    missedReports,
    missedThreshold: STALE_AFTER_MISSED_REPORTS,
    lagging: missedReports !== null && missedReports > 0 && !stale,
    lastRunFailed: lastRun?.status === "FAILED",
  };
}

/**
 * Raise the alert, or withdraw it once the sheets come back.
 *
 * Both halves matter. An alert nobody ever sees cleared is an alert that
 * stops being read.
 */
export async function reconcileSyncStaleAlert(): Promise<SyncFreshness> {
  const freshness = await checkSyncFreshness();
  const problem = freshness.stale || freshness.lagging || freshness.lastRunFailed;

  if (!problem) {
    await db.inventoryAlert.updateMany({
      where: { type: "SYNC_STALE", isResolved: false },
      data: { isResolved: true, resolvedAt: new Date() },
    });
    return freshness;
  }

  const hours = freshness.hoursSince;
  /* Worded as "no contact", not "no price sheet", because that is what is
     actually being reported: the sheets are read twice a day whether or not
     they changed, so silence means the machine in the office stopped
     reporting, not that the supplier has been quiet. */
  const message = freshness.stale
    ? hours === null
      ? "לא התקבל אף מחירון. המלאי והמחירים באתר אינם מעודכנים."
      : /* The wall-clock number, because that is the one a person can check
           against their own memory of when the shop last did anything. The
           missed-runs figure is what decided to raise this, and it goes in
           beside it rather than instead of it — "2 ריצות" is the reason and
           "24 שעות" is the damage. */
        `המחשב במשרד לא דיווח כבר ${Math.floor(hours)} שעות — ${freshness.missedReports} ריצות סנכרון לא התקיימו. המלאי והמחירים באתר אינם מעודכנים.`
    : freshness.lastRunFailed
      ? "הסנכרון האחרון נכשל. המלאי והמחירים באתר עלולים להיות לא מעודכנים."
      : /* One missed run. Said plainly and kept a WARNING, because the
           commonest cause is a Mac that woke late and will report on its
           own in a few hours — and because the next missed run turns this
           same alert red without anybody having to notice twice. */
        `ריצת סנכרון אחת לא התקיימה${hours === null ? "" : ` (${Math.floor(hours)} שעות ללא דיווח)`}. אם גם הבאה תחסר — המלאי באתר יישאר מאחור.`;

  const severity = freshness.stale || freshness.lastRunFailed ? "CRITICAL" : "WARNING";

  /* Rewritten rather than added to, so the open alert always states the
     current gap instead of leaving the first hour's wording in place while
     the number it describes keeps growing. The severity is rewritten with
     it: one missed run opens this as a WARNING and the second has to be
     able to turn that same row red, or the escalation only exists in the
     text and every screen that sorts or filters by severity misses it. */
  const open = await db.inventoryAlert.findFirst({
    where: { type: "SYNC_STALE", isResolved: false },
    select: { id: true, message: true, severity: true },
  });
  if (open) {
    if (open.message !== message || open.severity !== severity) {
      await db.inventoryAlert.update({ where: { id: open.id }, data: { message, severity } });
    }
  } else {
    await db.inventoryAlert.create({
      data: { type: "SYNC_STALE", severity, message },
    });
  }

  return freshness;
}

/**
 * Is every tab of every price list still producing updates?
 *
 * checkSyncFreshness above asks whether the sheets are arriving. This asks
 * the question one level down, which is the question nobody was asking when
 * four tabs of the white-goods workbook stopped resolving to a category on
 * 9 September and nothing lit up for 35 days.
 *
 * The reason the file-level check could not see it is worth stating plainly,
 * because it is the whole design constraint here: the workbook changed every
 * single day. Twenty-six of its thirty tabs were being read and applied
 * normally, so `uploadedAt` moved, `lastScannedAt` moved, the run reported
 * SUCCESS, and four dead tabs were invisible inside a healthy file.
 *
 * Which also rules out the obvious implementation. "A tab that has not
 * updated in seven days" would cry wolf on every quiet workbook: the sync
 * skips a source whose sha256 is unchanged, so a supplier who sends nothing
 * for a week leaves every tab in that file untouched, correctly. Measuring a
 * tab against the calendar reports that as thirty faults.
 *
 * So each tab is measured against *its own workbook's* other tabs. A tab
 * that has not moved while its neighbours moved yesterday is the fault that
 * actually happened; a workbook where nothing moved is a quiet supplier, and
 * SYNC_STALE is already watching for the case where that silence is real.
 */
export const SHEET_LAG_DAYS = 7;

export type SheetFreshness = {
  sheetName: string;
  sourceId: string;
  /** Last run that wrote a row of this tab. */
  lastUpdateAt: Date | null;
  /** The newest tab in the same workbook, which is the yardstick. */
  sourceLastUpdateAt: Date | null;
  /** Days this tab lags the rest of its own workbook. */
  lagDays: number | null;
  /** What it is costing: products on the site whose stock is frozen. */
  livePublished: number;
  stale: boolean;
};

export async function checkSheetFreshness(): Promise<SheetFreshness[]> {
  /* select, and grouped in the database: this runs on a cron against a
     catalogue of 2,218 sheet-backed products and has no business pulling
     rows back to count them here. */
  const grouped = await db.product.groupBy({
    by: ["sourceId", "sourceSheet"],
    where: { sourceId: { not: null }, sourceSheet: { not: null } },
    _max: { lastExcelSyncAt: true },
    _count: { _all: true },
  });

  /* Counted separately rather than filtered into the group above, because a
     tab holding only unpublished products is still a tab that stopped
     updating — it just is not costing anything yet, and the alert should say
     so instead of not existing. */
  const liveGrouped = await db.product.groupBy({
    by: ["sourceSheet"],
    where: {
      sourceId: { not: null },
      sourceSheet: { not: null },
      isPublished: true,
      stockQty: { gt: 0 },
    },
    _count: { _all: true },
  });
  const liveBySheet = new Map(liveGrouped.map((g) => [g.sourceSheet ?? "", g._count._all]));

  const newestBySource = new Map<string, Date>();
  for (const g of grouped) {
    const at = g._max.lastExcelSyncAt;
    if (!g.sourceId || !at) continue;
    const current = newestBySource.get(g.sourceId);
    if (!current || at > current) newestBySource.set(g.sourceId, at);
  }

  const now = new Date();
  return grouped
    .filter((g): g is typeof g & { sourceId: string; sourceSheet: string } =>
      g.sourceId !== null && g.sourceSheet !== null,
    )
    .map((g) => {
      const lastUpdateAt = g._max.lastExcelSyncAt;
      const sourceLastUpdateAt = newestBySource.get(g.sourceId) ?? null;
      /* Against the workbook's own newest tab, and `now` only as a backstop
         for a workbook with no readable timestamp at all. */
      const yardstick = sourceLastUpdateAt ?? now;
      const lagDays =
        lastUpdateAt === null
          ? null
          : (yardstick.getTime() - lastUpdateAt.getTime()) / 86_400_000;
      return {
        sheetName: g.sourceSheet,
        sourceId: g.sourceId,
        lastUpdateAt,
        sourceLastUpdateAt,
        lagDays: lagDays === null ? null : Math.round(lagDays * 10) / 10,
        livePublished: liveBySheet.get(g.sourceSheet) ?? 0,
        stale: lagDays === null || lagDays >= SHEET_LAG_DAYS,
      };
    })
    .sort((a, b) => (b.lagDays ?? 0) - (a.lagDays ?? 0));
}

/**
 * Raise one alert per lagging tab, and withdraw it when the tab catches up.
 *
 * One per tab and not one summary, because the first thing a person does
 * with this is go and look at that tab in the workbook, and an alert that
 * names four tabs is an alert that gets half-read. Keyed on the tab name in
 * `metadata` so several can be open at once — four were, in September.
 */
export async function reconcileStaleSheetAlerts(): Promise<SheetFreshness[]> {
  const sheets = await checkSheetFreshness();
  const stale = sheets.filter((s) => s.stale);

  const open = await db.inventoryAlert.findMany({
    where: { type: "SHEET_STALE", isResolved: false },
    select: { id: true, message: true, metadata: true },
  });
  const sheetOf = (metadata: string | null): string | null => {
    if (!metadata) return null;
    try {
      const parsed: unknown = JSON.parse(metadata);
      const name = (parsed as { sheetName?: unknown })?.sheetName;
      return typeof name === "string" ? name : null;
    } catch {
      return null;
    }
  };

  const stillStale = new Set(stale.map((s) => s.sheetName));
  const resolveIds = open
    .filter((a) => {
      const name = sheetOf(a.metadata);
      return name === null || !stillStale.has(name);
    })
    .map((a) => a.id);
  if (resolveIds.length > 0) {
    await db.inventoryAlert.updateMany({
      where: { id: { in: resolveIds } },
      data: { isResolved: true, resolvedAt: new Date() },
    });
  }

  for (const sheet of stale) {
    const days = sheet.lagDays === null ? null : Math.floor(sheet.lagDays);
    const message =
      `הלשונית "${sheet.sheetName}" לא עודכנה ${days === null ? "אף פעם" : `${days} יום`} ` +
      `בזמן ששאר הלשוניות באותה חוברת מתעדכנות. ` +
      (sheet.livePublished > 0
        ? `${sheet.livePublished} מוצרים מפורסמים ממנה מציגים מלאי ומחיר שאינם מתעדכנים.`
        : `אין ממנה מוצרים מפורסמים כרגע.`);
    const existing = open.find((a) => sheetOf(a.metadata) === sheet.sheetName);
    if (existing) {
      if (existing.message !== message) {
        await db.inventoryAlert.update({ where: { id: existing.id }, data: { message } });
      }
    } else {
      await db.inventoryAlert.create({
        data: {
          type: "SHEET_STALE",
          /* CRITICAL, like SYNC_STALE and for the same reason: the shop is
             selling against numbers nobody is maintaining. A WARNING here
             would sit in the same pile this change exists to empty. */
          severity: "CRITICAL",
          sourceId: sheet.sourceId,
          message,
          metadata: JSON.stringify({
            sheetName: sheet.sheetName,
            lagDays: sheet.lagDays,
            livePublished: sheet.livePublished,
          }),
        },
      });
    }
  }

  return sheets;
}

/** How far back a run counts. Three days, so a Friday incident is still
    reported when the office opens on Sunday — the check runs every three
    hours, but nobody is reading it over a weekend. */
const REPLACEMENT_WINDOW_HOURS = 72;

export async function checkReplacedProducts(): Promise<ReplacedProduct[]> {
  const since = new Date(Date.now() - REPLACEMENT_WINDOW_HOURS * 3_600_000);
  /* Both sides out of the run's own change log. The sync writes
     PRODUCT_MISSING_FROM_SOURCE and NEW_PRODUCT in the same pass over the
     same sheet, so a pair of them on one row of one tab in one run is that
     run stating, in its own record, that it swapped one product for
     another. Nothing is inferred from a hash or a name. */
  const events = await db.inventoryChangeEvent.findMany({
    where: {
      createdAt: { gte: since },
      changeType: { in: ["PRODUCT_MISSING_FROM_SOURCE", "NEW_PRODUCT"] },
      productId: { not: null },
    },
    select: {
      changeType: true,
      syncRunId: true,
      product: {
        select: {
          id: true,
          sku: true,
          title: true,
          price: true,
          stockQty: true,
          sourceSheet: true,
          sourceRowRef: true,
          missingFromSourceSince: true,
        },
      },
    },
  });

  const lost: RunCasualty[] = [];
  const created: RunArrival[] = [];
  for (const e of events) {
    const p = e.product;
    if (!p) continue;
    const common = {
      id: p.id,
      syncRunId: e.syncRunId,
      sheetName: p.sourceSheet,
      rowRef: p.sourceRowRef,
      sku: p.sku,
    };
    if (e.changeType === "PRODUCT_MISSING_FROM_SOURCE") {
      lost.push({
        ...common,
        title: p.title,
        price: p.price,
        stockQty: p.stockQty,
        stillGone: p.missingFromSourceSince !== null,
      });
    } else {
      created.push(common);
    }
  }
  return pairReplacements(lost, created);
}

/**
 * One alert for the whole event, withdrawn when it is no longer true.
 *
 * One and not fourteen, deliberately. Fourteen CRITICALs in a list is a
 * list a person scrolls, and the thing they need to know is a single fact
 * — "this morning's run swapped fourteen products for empty records" —
 * with the biggest one named so it can be checked in a click.
 */
export async function reconcileReplacedProductAlert(): Promise<ReplacedProduct[]> {
  const replaced = await checkReplacedProducts();
  const open = await db.inventoryAlert.findMany({
    where: { type: "PRODUCT_REPLACED_BY_BLANK", isResolved: false },
    select: { id: true, message: true },
  });

  if (replaced.length === 0) {
    if (open.length > 0) {
      await db.inventoryAlert.updateMany({
        where: { id: { in: open.map((a) => a.id) } },
        data: { isResolved: true, resolvedAt: new Date() },
      });
    }
    return [];
  }

  /* Only what is still off the site. A pair somebody has already put back
     is history, and an alert that keeps naming it is an alert nobody can
     close. */
  const open_ = replaced.filter((r) => r.stillGone);
  if (open_.length === 0) {
    if (open.length > 0) {
      await db.inventoryAlert.updateMany({
        where: { id: { in: open.map((a) => a.id) } },
        data: { isResolved: true, resolvedAt: new Date() },
      });
    }
    return [];
  }
  const total = open_.reduce((sum, r) => sum + r.value, 0);
  const worst = open_[0];
  const message =
    `${open_.length} מוצרים יצאו מהאתר וסנכרון יצר רשומה ריקה על אותה שורה בדיוק. ` +
    `${total.toLocaleString("he-IL")} ₪ מלאי הפסיק להימכר. ` +
    `הגדול שבהם: ${worst.lostTitle.slice(0, 60)} (מק״ט ${worst.lostSku}, לשונית ${worst.sheetName} שורה ${worst.rowRef}) ` +
    `— הוחלף במק״ט ${worst.blankSku}. ` +
    `זה לא מוצר חדש שהגיע: זו אותה שורה עם אותו תוכן, והמוצר שהיה עליה נעלם מהאתר.`;

  const existing = open[0];
  if (existing) {
    if (existing.message !== message) {
      await db.inventoryAlert.update({ where: { id: existing.id }, data: { message } });
    }
  } else {
    await db.inventoryAlert.create({
      data: {
        type: "PRODUCT_REPLACED_BY_BLANK",
        /* CRITICAL without hesitation: products a customer could buy an
           hour ago cannot be bought now, and the run that did it reported
           success. */
        severity: "CRITICAL",
        message,
      },
    });
  }
  /* Any others are a second event on top of an unread first one. Fold them
     into the one alert rather than stacking, same as the sheet check. */
  if (open.length > 1) {
    await db.inventoryAlert.updateMany({
      where: { id: { in: open.slice(1).map((a) => a.id) } },
      data: { isResolved: true, resolvedAt: new Date() },
    });
  }
  return open_;
}


/**
 * Did the shop just get smaller?
 *
 * The one check that does not need to know what went wrong. Every failure
 * of 11-12 October — a run swapping 45 live products for blank records one
 * evening and 14 more the next morning, ₪340,000 of stock off the site —
 * was invisible to every screen in the back office and to every alert in
 * this system, and was found because the owner happened to ask an
 * unrelated question. Each has a check now. None of those checks would
 * have caught the others, because each was written after the fact and
 * describes its own shape.
 *
 * This one describes no shape. It samples how many products a customer can
 * buy, every time the watchdog runs, and says so when that number falls.
 * Whatever breaks the catalogue next — a matcher, a query, a migration, an
 * agent writing SQL at four in the morning — the shop gets smaller, and
 * that is the one symptom they all share.
 *
 * Two numbers, and the second is what stops it crying wolf. `liveCount` is
 * PUBLIC_PRODUCT_WHERE: what is actually for sale. `inStockCount` is what
 * the price list says we hold. A supplier selling out moves both together
 * and is not a fault; us breaking something moves the first while the
 * second stays where it was. The alert only fires on the gap between them.
 */
export type CatalogSize = {
  liveNow: number;
  inStockNow: number;
  /** The highest live count seen in the comparison window. */
  livePeak: number;
  inStockAtPeak: number;
  /** Live products lost since the peak, beyond what stock explains. */
  unexplainedDrop: number;
  peakAt: Date | null;
  dropped: boolean;
};

/** How far back the peak is taken from. A day: long enough that a single
    bad run is compared against a healthy shop, short enough that a
    deliberate cull last week is not held against today. */
const CATALOG_WINDOW_HOURS = 24;
/** Below this nothing is said. Products leave the site one at a time all
    day — a photograph removed, stock hitting zero — and an alert on every
    one of those is an alert that gets muted. 45 and 14 both clear it. */
const CATALOG_DROP_FLOOR = 10;

export async function checkCatalogSize(): Promise<CatalogSize> {
  const [liveNow, inStockNow] = await Promise.all([
    db.product.count({ where: PUBLIC_PRODUCT_WHERE }),
    db.product.count({
      where: {
        source: { sourceType: "EXCEL", isActive: true },
        missingFromSourceSince: null,
        stockQty: { gt: 0 },
      },
    }),
  ]);

  const since = new Date(Date.now() - CATALOG_WINDOW_HOURS * 3_600_000);
  const history = await db.catalogSizeSnapshot.findMany({
    where: { takenAt: { gte: since } },
    orderBy: { liveCount: "desc" },
    take: 1,
  });
  /* Recorded before the comparison is read, so the first run after this
     ships writes a baseline and says nothing — a check that fires on its
     own first execution is a check nobody trusts afterwards. */
  await db.catalogSizeSnapshot.create({ data: { liveCount: liveNow, inStockCount: inStockNow } });

  const peak = history[0];
  if (!peak) {
    return {
      liveNow,
      inStockNow,
      livePeak: liveNow,
      inStockAtPeak: inStockNow,
      unexplainedDrop: 0,
      peakAt: null,
      dropped: false,
    };
  }

  const liveLost = peak.liveCount - liveNow;
  /* What the supplier explains. Stock that ran out takes products off the
     site legitimately, so only the part of the fall that outruns it is
     ours. Negative — the shop grew, or stock fell further than the site
     did — is zero, not a credit. */
  const stockLost = Math.max(0, peak.inStockCount - inStockNow);
  const unexplainedDrop = Math.max(0, liveLost - stockLost);

  return {
    liveNow,
    inStockNow,
    livePeak: peak.liveCount,
    inStockAtPeak: peak.inStockCount,
    unexplainedDrop,
    peakAt: peak.takenAt,
    dropped: unexplainedDrop >= CATALOG_DROP_FLOOR,
  };
}

/**
 * Raise it, and withdraw it when the shop is back to its own size.
 *
 * Withdrawn on recovery rather than on a timer, because the thing a person
 * wants to know is whether the products came back — and on 12 October they
 * came back by hand, which no sync run would have reported either.
 */
export async function reconcileCatalogSizeAlert(): Promise<CatalogSize> {
  const size = await checkCatalogSize();
  const open = await db.inventoryAlert.findMany({
    where: { type: "CATALOG_SHRANK", isResolved: false },
    select: { id: true, message: true },
  });

  if (!size.dropped) {
    if (open.length > 0) {
      await db.inventoryAlert.updateMany({
        where: { id: { in: open.map((a) => a.id) } },
        data: { isResolved: true, resolvedAt: new Date() },
      });
    }
    return size;
  }

  const message =
    `האתר הציג ${size.livePeak.toLocaleString("he-IL")} מוצרים ועכשיו ${size.liveNow.toLocaleString("he-IL")}. ` +
    `${size.unexplainedDrop.toLocaleString("he-IL")} מהם ירדו בלי שהמלאי מסביר את זה — ` +
    `במחירון יש ${size.inStockNow.toLocaleString("he-IL")} מוצרים במלאי מול ${size.inStockAtPeak.toLocaleString("he-IL")} קודם. ` +
    `כלומר משהו אצלנו הוריד מוצרים מהאתר, לא הספק.`;

  const existing = open[0];
  if (existing) {
    if (existing.message !== message) {
      await db.inventoryAlert.update({ where: { id: existing.id }, data: { message } });
    }
  } else {
    await db.inventoryAlert.create({
      data: { type: "CATALOG_SHRANK", severity: "CRITICAL", message },
    });
  }
  if (open.length > 1) {
    await db.inventoryAlert.updateMany({
      where: { id: { in: open.slice(1).map((a) => a.id) } },
      data: { isResolved: true, resolvedAt: new Date() },
    });
  }
  return size;
}

// ---------------------------------------------------------------------------
// A price that belongs to a different appliance
// ---------------------------------------------------------------------------

export type ForeignBinding = {
  id: string;
  sku: string;
  title: string;
  model: string | null;
  rowModel: string | null;
  sheet: string | null;
  rowRef: number | null;
  price: number;
  supplierCost: number | null;
  stockQty: number;
  isPublished: boolean;
};

/**
 * Products whose bound row names a different appliance than they do.
 *
 * The standing half of the 12 October fridge. `rowModelWasReassigned` in the
 * sync catches the moment a SKU moves onto another product, and that is the
 * only moment it is distinguishable from enrichment correcting our own
 * model — but it is blind to a SKU that had already moved before anyone was
 * looking. Twenty live products were in that state when the catalogue was
 * first swept by hand, 72,676 ₪ of listed price, one of them a 530-litre
 * top-freezer priced as a 660-litre four-door.
 *
 * Asked from outside a sync run, like every other check in this file, and
 * for the sharper version of the same reason: the run cannot see this at
 * all. Its own guard compares the row to the row, and a row that has not
 * changed in months passes every test the run has.
 *
 * `rowBindingLooksForeign` carries the filters and the measurements behind
 * them. This only has to decide who to ask about and how to say it.
 */
export async function checkForeignRowBindings(): Promise<ForeignBinding[]> {
  const candidates = await db.product.findMany({
    where: {
      /* NO STOCK FILTER, and that is the correction rather than the
         original design. This asked only about products with something on
         the shelf, carried over from the by-hand sweep that found "twenty
         LIVE products" — and an empty shelf is not safety, it is dormancy.
         A product with a drifted binding and no stock is one sync away
         from the site at a price that came off another machine's row, and
         reconcileAutoPublish will put it there without anybody pressing
         anything.

         140201 is the proof: a Bosch SMS4ECW28E bound to a row that had
         become an SMV 2HTX06E, wearing the SMV's 2,790 ₪ and the SMV's
         2,350 ₪ cost. Zero stock, so this sweep never asked about it — and
         a customer still ordered it, at a price that read as a 440 ₪
         profit and was really an 890 ₪ loss.

         Measured when the filter came out: 83 products have a foreign
         binding, 29 in stock and already asked about, 54 with none — 52 of
         those published, 74,550 ₪ of listed price waiting for a stock
         figure. */
      missingFromSourceSince: null,
      model: { not: null },
      lastRowModel: { not: null },
      source: { is: { sourceType: "EXCEL", isActive: true } },
    },
    select: {
      id: true,
      sku: true,
      title: true,
      model: true,
      lastRowModel: true,
      sourceSheet: true,
      sourceRowRef: true,
      price: true,
      supplierCost: true,
      stockQty: true,
      isPublished: true,
    },
  });

  return candidates
    .filter((p) => rowBindingLooksForeign(p))
    .map((p) => ({ ...p, rowModel: p.lastRowModel, sheet: p.sourceSheet, rowRef: p.sourceRowRef }))
    /* Stocked first, because those are selling today; then by price, so
       the dormant ones are ordered by what they would cost if they woke
       up rather than arbitrarily. */
    .sort((a, b) => b.price * b.stockQty - a.price * a.stockQty || b.price - a.price);
}

/**
 * One alert per product, raised once and never re-raised.
 *
 * Deliberately not reconciled against current state the way
 * CATALOG_SHRANK is. The question this asks cannot be answered from the
 * database — it takes somebody opening the price list and reading the row —
 * so re-raising it every three hours on a product a person has already
 * looked at and cleared would train them to resolve it without looking,
 * which is worse than not asking. A row that genuinely changes after that
 * is the sync's transition guard's business, and it raises its own.
 *
 * So: ask once per product, ever. `isResolved` is not in the filter for the
 * same reason.
 */
export async function reconcileForeignRowBindingAlerts(): Promise<ForeignBinding[]> {
  const found = await checkForeignRowBindings();
  if (found.length === 0) return found;

  const alreadyAsked = await db.inventoryAlert
    .findMany({
      where: {
        type: "ROW_NAMES_ANOTHER_MODEL",
        productId: { in: found.map((f) => f.id) },
      },
      select: { productId: true },
    })
    .then((rows) => new Set(rows.map((r) => r.productId)));

  const fresh = found.filter((f) => !alreadyAsked.has(f.id));
  for (const f of fresh) {
    await db.inventoryAlert.create({
      data: {
        type: "ROW_NAMES_ANOTHER_MODEL",
        severity: "CRITICAL",
        productId: f.id,
        sourceSku: f.sku,
        message:
          `${f.title}: השורה במחירון (${f.sheet ?? "?"} שורה ${f.rowRef ?? "?"}) מדפיסה דגם ` +
          `${f.rowModel ?? "?"}, והדגם של המוצר הוא ${f.model ?? "?"} — שני קודים שלא חולקים ` +
          `אפילו שלושה תווים, כלומר כנראה שני מוצרים שונים. ` +
          `המחיר שמוצג (${f.price.toLocaleString("he-IL")} ₪` +
          (f.supplierCost ? `, עלות ${f.supplierCost.toLocaleString("he-IL")} ₪` : "") +
          `) הוא המחיר של השורה הזאת. צריך לפתוח את המחירון ולבדוק לאיזה מוצר השורה שייכת.`,
        metadata: JSON.stringify({
          productModel: f.model,
          rowModel: f.rowModel,
          sheet: f.sheet,
          row: f.rowRef,
          price: f.price,
          supplierCost: f.supplierCost,
          raisedBy: "watchdog",
        }),
      },
    });
  }
  return fresh;
}

// ---------------------------------------------------------------------------
// A price no appliance can carry
// ---------------------------------------------------------------------------

export type UnderpricedProduct = {
  id: string;
  sku: string;
  title: string;
  price: number;
  supplierCost: number | null;
  reason: UnderpricedReason;
};

/**
 * Every published, sellable product whose price is under the storefront's
 * floor or at or below its own cost. The floor is also a where-clause in
 * PUBLIC_PRODUCT_WHERE, so such a product is already off the site; this is
 * what tells a person it is sitting there with no real price. The cost rule
 * cannot be a where-clause at all (Prisma compares a column to a value, not
 * to another column), and a product at its own cost IS on the site — the
 * sync's strict floor stops an adoption, never a price a flag has frozen.
 */
export async function checkUnderpricedProducts(): Promise<UnderpricedProduct[]> {
  const rows = await db.product.findMany({
    where: { ...PUBLIC_PRODUCT_WHERE, price: { gt: 0 } },
    select: { id: true, sku: true, title: true, price: true, supplierCost: true },
  });
  const found: UnderpricedProduct[] = [];
  for (const r of rows) {
    const reason = underpricedReason(r.price, r.supplierCost);
    if (reason) found.push({ ...r, reason });
  }
  return found.sort((a, b) => a.price - b.price);
}

/** One open PRICE_BELOW_COST alert per product while it is underpriced,
    resolved by this sweep once it is not. Only the alerts this sweep raised
    are resolved by it: one a person wrote by hand stays until a person
    closes it. */
export async function reconcileUnderpricedAlerts(): Promise<UnderpricedProduct[]> {
  const found = await checkUnderpricedProducts();
  const open = await db.inventoryAlert.findMany({
    where: { type: "PRICE_BELOW_COST", isResolved: false },
    select: { id: true, productId: true, metadata: true },
  });
  const foundIds = new Set(found.map((f) => f.id));
  const stale = open.filter(
    (a) => a.productId && !foundIds.has(a.productId) && (a.metadata ?? "").includes('"raisedBy":"watchdog"'),
  );
  if (stale.length > 0) {
    await db.inventoryAlert.updateMany({
      where: { id: { in: stale.map((a) => a.id) } },
      data: { isResolved: true, resolvedAt: new Date() },
    });
  }
  const covered = new Set(open.map((a) => a.productId));
  for (const f of found) {
    if (covered.has(f.id)) continue;
    await db.inventoryAlert.create({
      data: {
        type: "PRICE_BELOW_COST",
        severity: "CRITICAL",
        productId: f.id,
        sourceSku: f.sku,
        message:
          `${f.title}: מוצג ב-${f.price.toLocaleString("he-IL")} ₪` +
          (f.supplierCost ? ` (עלות ${f.supplierCost.toLocaleString("he-IL")} ₪)` : "") +
          ` — ${UNDERPRICED_LABELS[f.reason]}. ` +
          (f.reason === "below_floor"
            ? "האתר לא מציג אותו עד שייקבע מחיר אמיתי."
            : "הוא מוצג באתר במחיר הזה עכשיו. צריך לבדוק את השורה במחירון ולתקן."),
        metadata: JSON.stringify({ price: f.price, supplierCost: f.supplierCost, reason: f.reason, raisedBy: "watchdog" }),
      },
    });
  }
  return found;
}

// ---------------------------------------------------------------------------
// A title that names a different product than the record does
// ---------------------------------------------------------------------------

export type TitleMismatch = {
  id: string;
  sku: string;
  title: string;
  model: string | null;
  codeInTitle: string;
  price: number;
  stockQty: number;
};

/**
 * Live products whose Hebrew title prints a model code their model field
 * does not know.
 *
 * The third of the three shapes, and the only one that is entirely our own
 * doing: the price list is right, the row is right, and the two halves of
 * the record contradict each other. A customer reads the title.
 *
 * Asked from outside a run for the same reason as the other two, and with
 * the same manners: once per product, ever. The answer needs the
 * manufacturer, not another pass over the database, so re-asking every
 * three hours would only teach whoever reads these to close them unread.
 */
export async function checkTitleModelMismatch(): Promise<TitleMismatch[]> {
  const candidates = await db.product.findMany({
    where: {
      ...PUBLIC_PRODUCT_WHERE,
      model: { not: null },
    },
    select: { id: true, sku: true, title: true, model: true, price: true, stockQty: true },
  });

  const found: TitleMismatch[] = [];
  for (const p of candidates) {
    const codeInTitle = titleNamesAnotherModel(p);
    if (codeInTitle) found.push({ ...p, codeInTitle });
  }
  return found.sort((a, b) => b.price * b.stockQty - a.price * a.stockQty);
}

export async function reconcileTitleModelAlerts(): Promise<TitleMismatch[]> {
  const found = await checkTitleModelMismatch();
  if (found.length === 0) return found;

  const alreadyAsked = await db.inventoryAlert
    .findMany({
      where: {
        type: "TITLE_NAMES_ANOTHER_MODEL",
        productId: { in: found.map((f) => f.id) },
      },
      select: { productId: true },
    })
    .then((rows) => new Set(rows.map((r) => r.productId)));

  const fresh = found.filter((f) => !alreadyAsked.has(f.id));
  for (const f of fresh) {
    await db.inventoryAlert.create({
      data: {
        type: "TITLE_NAMES_ANOTHER_MODEL",
        severity: "WARNING",
        productId: f.id,
        sourceSku: f.sku,
        message:
          `${f.title}: הכותרת מדפיסה את קוד הדגם ${f.codeInTitle}, ` +
          `ושדה הדגם של המוצר הוא ${f.model ?? "?"}. שני קודים שונים על אותה רשומה, ` +
          `והלקוח קורא את הכותרת. לא בהכרח הכותרת היא השגויה — לא פעם היא והשורה ` +
          `במחירון מסכימות ודווקא שדה הדגם הוא שנשאר מאחור. צריך להכריע מול היצרן.`,
        metadata: JSON.stringify({
          codeInTitle: f.codeInTitle,
          modelField: f.model,
          price: f.price,
          stockQty: f.stockQty,
          raisedBy: "watchdog",
        }),
      },
    });
  }
  return fresh;
}

// ---------------------------------------------------------------------------
// The same machine on the site twice, at two prices
// ---------------------------------------------------------------------------

export type { DuplicateGroup };

/**
 * Two published products wearing one model code.
 *
 * The third thing a sync run cannot see about itself, after a drifted row
 * binding and a swapped product: a second record for something the
 * catalogue already had. Each run is right — a row with no SKU matched
 * nothing, so a new product is the only honest answer — and the catalogue
 * is wrong, because the thing already exists under a binding that drifted
 * months ago. Only a sweep from outside can hold both halves at once.
 *
 * See lib/inventory/duplicate-listings.ts for why the severity is decided
 * by money rather than by difference, and why a different colour does not
 * clear it.
 */
export async function checkDuplicateListings(): Promise<DuplicateGroup[]> {
  /* Published, not PUBLIC_PRODUCT_WHERE. A twin with no stock or no photo
     is invisible today and one sync away from being on the shelf beside
     its double, and it is the pair that is wrong, not the visible half. */
  const rows = await db.product.findMany({
    where: { isPublished: true, model: { not: null } },
    select: {
      id: true,
      sku: true,
      title: true,
      model: true,
      price: true,
      supplierCost: true,
      stockQty: true,
      colorName: true,
      isPublished: true,
    },
  });
  return findDuplicateListings(rows);
}

/**
 * One DUPLICATE_MODEL alert per model code, once, ever.
 *
 * Same manners as the other two sweeps that cannot settle their own
 * question: deciding which of two records is the real one means opening
 * the price list, and re-asking every three hours is how people learn to
 * close these unread. Keyed on the model code in the metadata rather than
 * on a productId, because the finding is about the pair — pinning it to
 * one of them would raise it again from the other side.
 */
export async function reconcileDuplicateListingAlerts(): Promise<DuplicateGroup[]> {
  const found = await checkDuplicateListings();
  if (found.length === 0) return found;

  const asked = await db.inventoryAlert
    .findMany({ where: { type: "DUPLICATE_MODEL" }, select: { metadata: true } })
    .then((rows) => {
      const keys = new Set<string>();
      for (const r of rows) {
        try {
          const key = JSON.parse(r.metadata ?? "{}").modelKey;
          if (typeof key === "string") keys.add(key);
        } catch {
          /* A hand-written alert with no metadata tells us nothing about
             which code it covered; it simply does not suppress one. */
        }
      }
      return keys;
    });

  const fresh = found.filter((g) => !asked.has(g.key));
  for (const group of fresh) {
    await db.inventoryAlert.create({
      data: {
        type: "DUPLICATE_MODEL",
        severity: group.severity,
        /* The cheapest listing, which is the one a customer would take
           and the one somebody has to look at first. */
        productId: group.listings[0].id,
        sourceSku: group.listings[0].sku,
        message: duplicateMessage(group),
        metadata: JSON.stringify({
          modelKey: group.key,
          lossPerUnit: group.lossPerUnit,
          buyableNow: group.buyableNow,
          listings: group.listings.map((l) => ({
            sku: l.sku,
            price: l.price,
            supplierCost: l.supplierCost,
            stockQty: l.stockQty,
            colorName: l.colorName,
          })),
          raisedBy: "watchdog",
        }),
      },
    });
  }
  return fresh;
}
