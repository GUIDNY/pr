import { NextResponse } from "next/server";
import { runFullSync } from "@/lib/inventory/sync";

// Hit by Vercel Cron (see vercel.json). Also safe to call manually with the
// right secret for testing. Vercel signs cron requests with an
// Authorization: Bearer <CRON_SECRET> header when CRON_SECRET is set.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
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
