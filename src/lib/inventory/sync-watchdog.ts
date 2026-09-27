import "server-only";
import { db } from "@/lib/db";

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
 * How long a gap is allowed before somebody is told.
 *
 * The agent pushes twice a day, 04:30 and 12:30, so the widest healthy gap
 * is the sixteen hours from one midday to the next dawn. Eighteen leaves two
 * hours of slack for a late run without letting a whole missed cycle pass.
 */
const STALE_AFTER_HOURS = 18;

/**
 * The measure is when a sheet last *arrived*, not when a sync last
 * succeeded, and the difference matters.
 *
 * A supplier who changes nothing for two days is a supplier whose sheet
 * arrives twice a day and whose sync is correctly skipped — the agent only
 * calls the sync when the bytes actually differ. Watching for runs would
 * cry wolf every quiet weekend, and an alert that cries wolf is an alert
 * the back office learns to scroll past, taking the next real one with it.
 *
 * An arriving sheet, on the other hand, is unambiguous: the machine inside
 * the company network read the file and this server stored it. That is the
 * whole chain that broke, and the only thing that stops it reading fresh is
 * something genuinely wrong.
 */
export type SyncFreshness = {
  stale: boolean;
  lastUploadAt: Date | null;
  hoursSince: number | null;
  thresholdHours: number;
  lastRunFailed: boolean;
};

export async function checkSyncFreshness(): Promise<SyncFreshness> {
  const [newest, lastRun] = await Promise.all([
    db.inventorySource.findFirst({
      where: { isActive: true },
      orderBy: { uploadedAt: "desc" },
      select: { uploadedAt: true },
    }),
    db.inventorySyncRun.findFirst({
      where: { status: { in: ["SUCCESS", "FAILED", "NO_CHANGES"] } },
      orderBy: { startedAt: "desc" },
      select: { status: true },
    }),
  ]);

  const at = newest?.uploadedAt ?? null;
  const hoursSince = at ? (Date.now() - at.getTime()) / 3_600_000 : null;
  /* Never having received one is stale too. A shop with products on the site
     and no sheet on record is not a state to treat as "early days". */
  const stale = hoursSince === null || hoursSince > STALE_AFTER_HOURS;

  return {
    stale,
    lastUploadAt: at,
    hoursSince,
    thresholdHours: STALE_AFTER_HOURS,
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
  const message = freshness.stale
    ? hours === null
      ? "לא התקבל אף מחירון. המלאי והמחירים באתר אינם מעודכנים."
      : `לא התקבל מחירון כבר ${Math.floor(hours)} שעות. המלאי והמחירים באתר אינם מעודכנים.`
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
