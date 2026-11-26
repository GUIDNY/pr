import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManageCatalog } from "@/lib/permissions";
import { CASHBACK_RELEASE_DAYS, CASHBACK_V2_FLAG, cashbackV2Enabled } from "@/lib/cashback-v2-rules";
import { runCashbackSettlement } from "@/lib/cashback-v2";

/**
 * Once a day: cashback v2's settlement (lib/cashback-v2.ts). Pending credits
 * of orders delivered CASHBACK_RELEASE_DAYS ago join the balance, those of
 * cancelled or returned orders are voided, and a credit released before its
 * order was refunded is clawed back from the balance.
 *
 * While CASHBACK_V2_ENABLED is off this answers "skipped" and touches
 * nothing — the tables it reads may not exist yet.
 *
 * Every step is keyed in the ledger, so an overlapping run or a retry after
 * a timeout repeats nothing.
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

  if (!cashbackV2Enabled()) {
    return NextResponse.json({ ok: true, skipped: `${CASHBACK_V2_FLAG} is off` });
  }
  const result = await runCashbackSettlement();
  return NextResponse.json({ ok: true, releaseDays: CASHBACK_RELEASE_DAYS, ...result });
}
