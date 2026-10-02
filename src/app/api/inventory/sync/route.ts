import { NextResponse } from "next/server";
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

  /* One sync at a time — the guard is inside runFullSync, not here, so the
     admin's own button is covered by it too. This end only has to turn the
     answer into a status code. */
  const run = await runFullSync("SCHEDULED");

  if (run.status === "SKIPPED") {
    // 409, not 200: the caller asked for something that did not happen, and
    // an agent that read this as success would report a green run on a day
    // nothing was imported.
    return NextResponse.json(
      { status: run.status, reason: run.errorMessage, runningSince: run.startedAt },
      { status: 409 },
    );
  }

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
