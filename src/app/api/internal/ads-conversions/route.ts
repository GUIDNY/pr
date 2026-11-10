import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManageCatalog } from "@/lib/permissions";
import { uploadPendingAdsConversions } from "@/lib/analytics/google-ads-conversions";

/**
 * Every quarter hour: paid orders that came from a Google Ads click and have
 * not been reported to Google Ads yet. See lib/analytics/google-ads-conversions.ts.
 * Off — reporting `configured: false` and the queue's length — until the
 * GOOGLE_ADS_* variables are set.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!(secret && auth === `Bearer ${secret}`)) {
    const session = await getSession();
    if (!session || !canManageCatalog(session.role)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  const result = await uploadPendingAdsConversions();
  return NextResponse.json({ ok: true, ...result });
}
