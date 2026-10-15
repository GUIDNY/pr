import { NextResponse } from "next/server";
import {
  reconcileSyncStaleAlert,
  reconcileStaleSheetAlerts,
  reconcileReplacedProductAlert,
  reconcileCatalogSizeAlert,
  reconcileForeignRowBindingAlerts,
  reconcileTitleModelAlerts,
} from "@/lib/inventory/sync-watchdog";
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

  /* Three questions on the same schedule: are the sheets arriving at all,
     is every tab inside them still producing updates, and did a run take a
     product off the site and put an empty record in its place. All three
     are here rather than in the sync for the same reason — a run that is
     failing, or doing damage, is not a reliable narrator of it. Four tabs
     of one workbook went dead for 35 days while the run reported SUCCESS
     every day because the other twenty-six kept it looking honest; on
     12 October a run swapped fourteen live products for blanks and
     reported SUCCESS, 15 added, 15 missing. */
  /* And a fourth, which is the only one of them that does not describe a
     shape: did the shop get smaller for a reason the price list does not
     explain. The other three each catch the failure they were written
     after; this one catches the next failure, whatever it turns out to
     be. */
  /* And a fifth, added after a customer was shown a 530-litre fridge at a
     660-litre fridge's price: does any product's row name a different
     appliance than the product does. The sync's own guard for this can
     only see the moment a SKU is reassigned, which is the one moment it is
     distinguishable from enrichment correcting our model — so a SKU that
     moved before anybody was watching is invisible to the run by
     construction, and twenty of them were. */
  /* And a sixth: does any product's own title print a model code its model
     field does not know. The only one of the six that is not about the price
     list at all — the row is right and the two halves of our record
     disagree, which is how a page titled "Samsung Crystal UHD 65U8000H"
     came to be an LG OLED evo 77" at 10,500 ₪. Its price was correct
     throughout; the name on it was not, and no price check can see that. */
  const [freshness, sheets, replaced, size, foreign, titles] = await Promise.all([
    reconcileSyncStaleAlert(),
    reconcileStaleSheetAlerts(),
    reconcileReplacedProductAlert(),
    reconcileCatalogSizeAlert(),
    reconcileForeignRowBindingAlerts(),
    reconcileTitleModelAlerts(),
  ]);
  const staleSheets = sheets.filter((s) => s.stale);
  return NextResponse.json({
    stale: freshness.stale,
    catalog: {
      shrank: size.dropped,
      liveNow: size.liveNow,
      livePeak: size.livePeak,
      unexplainedDrop: size.unexplainedDrop,
      inStockNow: size.inStockNow,
      peakAt: size.peakAt,
    },
    /* Named individually and not just counted: whoever or whatever reads
       this endpoint should be able to act without a second query. */
    replacedByBlank: replaced.map((r) => ({
      sheetName: r.sheetName,
      rowRef: r.rowRef,
      lostSku: r.lostSku,
      blankSku: r.blankSku,
      value: r.value,
    })),
    /* Newly asked about, not the standing total: an alert on one of these
       is raised once per product and never re-raised, so an empty list
       here means nothing new, not nothing wrong. */
    foreignRowBindings: foreign.map((f) => ({
      sku: f.sku,
      model: f.model,
      rowModel: f.rowModel,
      sheet: f.sheet,
      rowRef: f.rowRef,
      price: f.price,
      isPublished: f.isPublished,
    })),
    titleModelMismatches: titles.map((t) => ({
      sku: t.sku,
      codeInTitle: t.codeInTitle,
      modelField: t.model,
      price: t.price,
    })),
    staleSheets: staleSheets.map((s) => ({
      sheetName: s.sheetName,
      lagDays: s.lagDays,
      livePublished: s.livePublished,
      lastUpdateAt: s.lastUpdateAt,
    })),
    lastSeenAt: freshness.lastSeenAt,
    lastUploadAt: freshness.lastUploadAt,
    lastRunFailed: freshness.lastRunFailed,
    hoursSince: freshness.hoursSince === null ? null : Math.round(freshness.hoursSince * 10) / 10,
    openHoursSince: freshness.openHoursSince,
    /* What actually decided `stale`: scheduled runs the agent could have
       made and did not. Hours are the damage; this is the fault. */
    missedReports: freshness.missedReports,
    missedThreshold: freshness.missedThreshold,
    lagging: freshness.lagging,
  });
}
