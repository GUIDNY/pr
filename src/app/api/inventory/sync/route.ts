import { NextResponse } from "next/server";
import { runFullSync } from "@/lib/inventory/sync";
import { getSession } from "@/lib/auth";

// Hit by Vercel Cron (see vercel.json) via the CRON_SECRET bearer token.
// Also accepts a logged-in admin/staff session — lets a sync be triggered
// directly (e.g. right after registering a new source) without going
// through the UI button, which matters because this runs server-side,
// co-located with the database — orders of magnitude faster than driving
// the same sync from a developer machine on the other side of the network.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  const hasValidSecret = secret ? auth === `Bearer ${secret}` : false;

  if (!hasValidSecret) {
    const session = await getSession();
    if (!session || (session.role !== "ADMIN" && session.role !== "STAFF")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
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
