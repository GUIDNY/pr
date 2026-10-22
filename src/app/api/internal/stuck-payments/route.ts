import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManageCatalog } from "@/lib/permissions";
import { alertStuckPayments, STUCK_AFTER_MINUTES } from "@/lib/notify/payment-alert";

/**
 * Every quarter hour: an order that went to the gateway and never came
 * back.
 *
 * The other half of the payment alert lives in the Pelecard callback and
 * fires on a refusal, within seconds, because a refusal arrives. This half
 * exists because the expensive case does not arrive at all — PR-634879,
 * ₪3,800 on 10 October, has an order row, a name, a phone and an address,
 * an empty `rawResponse`, and no transaction id, and it sat for twelve days
 * because nothing anywhere was watching for silence.
 *
 * It asks from outside the thing that fails, which is the same reason
 * `inventory/sync-watchdog` is on its own cron: a payment that never
 * started cannot report that it never started.
 *
 * Sending is idempotent on `OrderNotification`'s (orderId, channel, event)
 * constraint, so a run that overlaps the previous one, or a retry after a
 * timeout, cannot mail the same order twice.
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

  const result = await alertStuckPayments();
  return NextResponse.json({ ok: true, afterMinutes: STUCK_AFTER_MINUTES, ...result });
}
