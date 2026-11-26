import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { chitaBotUnauthorized } from "@/lib/chita-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/chita/jobs/[orderNumber] — the bot's result for a claimed job.
 *
 * Body `{ ok: true, shipNo: string }` → DONE (+ the shipment number), or
 * `{ ok: false, error: string }` → ERROR (shown in the admin, retryable).
 * Only a CLAIMED job accepts a result, so a late or repeated report cannot
 * overwrite a finished one. Same Bearer auth as the queue.
 */
export async function POST(req: Request, ctx: { params: Promise<{ orderNumber: string }> }) {
  const denied = chitaBotUnauthorized(req);
  if (denied) return denied;

  const { orderNumber } = await ctx.params;
  let body: { ok?: unknown; shipNo?: unknown; error?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  const now = new Date();
  if (body.ok === true) {
    const shipNo = String(body.shipNo ?? "").trim().slice(0, 40);
    if (!shipNo) return NextResponse.json({ ok: false, error: "shipNo required" }, { status: 400 });
    const r = await db.order.updateMany({
      where: { orderNumber, chitaStatus: "CLAIMED" },
      data: { chitaStatus: "DONE", chitaShipNo: shipNo, chitaError: null, chitaUpdatedAt: now },
    });
    if (r.count === 0) return NextResponse.json({ ok: false, error: "job is not claimed" }, { status: 409 });
    return NextResponse.json({ ok: true });
  }
  if (body.ok === false) {
    const error = String(body.error ?? "שגיאה לא ידועה").trim().slice(0, 300) || "שגיאה לא ידועה";
    const r = await db.order.updateMany({
      where: { orderNumber, chitaStatus: "CLAIMED" },
      data: { chitaStatus: "ERROR", chitaError: error, chitaUpdatedAt: now },
    });
    if (r.count === 0) return NextResponse.json({ ok: false, error: "job is not claimed" }, { status: 409 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: false, error: "ok must be true or false" }, { status: 400 });
}
