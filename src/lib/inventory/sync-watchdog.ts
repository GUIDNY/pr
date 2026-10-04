import "server-only";
import { db } from "@/lib/db";
import { openHoursBetween, STALE_AFTER_OPEN_HOURS } from "@/lib/inventory/office-hours";

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
      What `stale` is actually measured against — see SERVER_WINDOW. */
  openHoursSince: number | null;
  thresholdHours: number;
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
  /* Never having heard from it is stale too. A shop with products on the
     site and no sheet on record is not a state to treat as "early days". */
  const stale = openHoursSince === null || openHoursSince > STALE_AFTER_OPEN_HOURS;

  return {
    stale,
    lastSeenAt: at,
    lastUploadAt,
    hoursSince,
    openHoursSince,
    thresholdHours: STALE_AFTER_OPEN_HOURS,
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
  const problem = freshness.stale || freshness.lastRunFailed;

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
           open-hours figure is what decided to raise this and is the wrong
           number to print — "9 hours" on a Sunday morning reads like a
           non-event when the sheets are in fact two days old. */
        `לא התקבל עדכון מהמחשב במשרד כבר ${Math.floor(hours)} שעות. המלאי והמחירים באתר עלולים להיות לא מעודכנים.`
    : "הסנכרון האחרון נכשל. המלאי והמחירים באתר עלולים להיות לא מעודכנים.";

  /* Rewritten rather than added to, so the open alert always states the
     current gap instead of leaving the first hour's wording in place while
     the number it describes keeps growing. */
  const open = await db.inventoryAlert.findFirst({
    where: { type: "SYNC_STALE", isResolved: false },
    select: { id: true, message: true },
  });
  if (open) {
    if (open.message !== message) {
      await db.inventoryAlert.update({ where: { id: open.id }, data: { message } });
    }
  } else {
    await db.inventoryAlert.create({
      data: { type: "SYNC_STALE", severity: "CRITICAL", message },
    });
  }

  return freshness;
}
