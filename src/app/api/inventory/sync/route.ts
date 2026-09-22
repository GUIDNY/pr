import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runFullSync } from "@/lib/inventory/sync";
import { getSession } from "@/lib/auth";
import { canManageCatalog } from "@/lib/permissions";

// Hit by Vercel Cron via the CRON_SECRET bearer token, by the price-sheet
// agent via INVENTORY_AGENT_SECRET (see scripts/agent/ — it posts the three
// workbooks to /api/inventory/source and then calls this only if any of them
// actually changed), or by a logged-in admin/staff session. The last lets a
// sync be triggered directly, e.g. right after registering a new source,
// which matters because this runs server-side, co-located with the database
// — orders of magnitude faster than driving the same sync from a developer
// machine on the other side of the network.
export const maxDuration = 300;

/* How long a run may be in flight before a new one is allowed to assume it
   died. Vercel kills the function at maxDuration, and a killed run leaves its
   row saying RUNNING forever — so this cannot be "until it finishes", or one
   crash would block every sync afterwards with no way to tell. */
const STALE_RUN_MINUTES = 10;

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const accepted = [process.env.CRON_SECRET, process.env.INVENTORY_AGENT_SECRET]
    .filter(Boolean)
    .map((s) => `Bearer ${s}`);
  const hasValidSecret = accepted.length > 0 && accepted.includes(auth ?? "");

  if (!hasValidSecret) {
    const session = await getSession();
    if (!session || !canManageCatalog(session.role)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  /* ONE SYNC AT A TIME.
   
     Nothing enforced this before, and nothing needed to: a sync happened when
     a person pressed a button, and a person does not press it twice in the
     same minute. With an agent calling this on a schedule that stops being
     true — two runs overlap the first time an upload lands while the previous
     scan is still walking 1,700 rows, and they write the same products from
     two different copies of the same sheet. The second one wins by accident.
   
     Refused rather than queued. A sync that was skipped costs nothing: the
     next one reads the same file and reaches the same place. A sync that
     interleaves with another costs a catalogue nobody can explain. */
  const inFlight = await db.inventorySyncRun.findFirst({
    where: {
      status: "RUNNING",
      startedAt: { gt: new Date(Date.now() - STALE_RUN_MINUTES * 60_000) },
    },
    select: { id: true, startedAt: true },
    orderBy: { startedAt: "desc" },
  });
  if (inFlight) {
    return NextResponse.json(
      {
        status: "SKIPPED",
        reason: "סנכרון אחר עדיין רץ",
        runningSince: inFlight.startedAt,
      },
      // 409, not 200: the caller asked for something that did not happen, and
      // an agent that reads this as success would report a green run on a day
      // nothing was imported.
      { status: 409 },
    );
  }

  const run = await runFullSync("SCHEDULED");
  return NextResponse.json({
    status: run.status,
    rowsScanned: run.rowsScanned,
    productsAdded: run.productsAdded,
    productsUpdated: run.productsUpdated,
    productsMissing: run.productsMissing,
    priceChanges: run.priceChanges,
    stockChanges: run.stockChanges,
  });
}
