import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManageCatalog } from "@/lib/permissions";
import { verifyPendingCrawlerHits } from "@/lib/pageview/crawler-verify.server";

/**
 * Daily: ask each vendor which addresses it crawls from, and stamp the
 * crawler log accordingly.
 *
 * Same door as the other crons here — the cron secret, or a signed-in
 * catalogue manager, so that it can be run by hand from a browser when
 * somebody wants an answer now rather than tomorrow.
 *
 * Twenty past two, which is an hour after the page-view rollup: the rollup
 * prunes `CrawlerHit` at 90 days and there is no sense verifying rows it is
 * about to drop.
 *
 * Returns the counts rather than nothing, because the number worth seeing
 * is `rejected` per crawler — a rejection is either somebody wearing
 * Googlebot's name or our own probe traffic, and both are things to look
 * at rather than tally silently.
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

  try {
    const report = await verifyPendingCrawlerHits();
    return NextResponse.json({ ok: true, ...report });
  } catch (error) {
    console.error("[crawler-verify] failed", error);
    return NextResponse.json({ ok: false, error: "verify failed" }, { status: 500 });
  }
}
