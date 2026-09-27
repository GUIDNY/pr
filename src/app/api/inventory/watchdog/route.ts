import { NextResponse } from "next/server";
import { reconcileSyncStaleAlert } from "@/lib/inventory/sync-watchdog";
import { getSession } from "@/lib/auth";
import { canManageCatalog } from "@/lib/permissions";

/**
 * Asks whether the stock sync is still happening, and says so where a
 * person will see it.
 *
 * A separate route on a separate schedule on purpose. Folding this into the
 * sync would recreate the exact hole it exists to close: for four days in
 * September the sheets stopped arriving, and because every alert in this
 * system is written by a sync run, a sync that never started reported
 * nothing at all. The check has to be somewhere the outage cannot reach.
 *
 * It touches the database and nothing else — no storage, no third party —
 * so the failures it watches for cannot take it down with them.
 */
export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  const hasValidSecret = secret ? auth === `Bearer ${secret}` : false;

  if (!hasValidSecret) {
    const session = await getSession();
    if (!session || !canManageCatalog(session.role)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const freshness = await reconcileSyncStaleAlert();
  return NextResponse.json({
    stale: freshness.stale,
    lastUploadAt: freshness.lastUploadAt,
    lastRunFailed: freshness.lastRunFailed,
    hoursSince: freshness.hoursSince === null ? null : Math.round(freshness.hoursSince * 10) / 10,
    thresholdHours: freshness.thresholdHours,
  });
}
