import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { chitaBotUnauthorized } from "@/lib/chita-auth";
import { israelDay, stageMeansDelivered } from "@/lib/chita";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_DAYS = 21;

/**
 * GET /api/chita/track — which Chita shipments the bot should look up.
 * `{ ok: true, items: [{ orderNumber, shipNo, createdDay: "DD/MM/YYYY" }] }`
 * for DONE orders with a shipment number, not yet delivered, taken in within
 * the last 21 days. createdDay is chitaUpdatedAt in Israel time.
 */
export async function GET(req: Request) {
  const denied = chitaBotUnauthorized(req);
  if (denied) return denied;
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000);
  const rows = await db.order.findMany({
    where: {
      chitaStatus: "DONE",
      chitaShipNo: { not: null },
      chitaDeliveredAt: null,
      chitaUpdatedAt: { gte: since },
    },
    orderBy: { chitaUpdatedAt: "asc" },
    take: 200,
    select: { orderNumber: true, chitaShipNo: true, chitaUpdatedAt: true },
  });
  const items = rows.map((r) => ({
    orderNumber: r.orderNumber,
    shipNo: r.chitaShipNo as string,
    createdDay: israelDay(r.chitaUpdatedAt as Date),
  }));
  return NextResponse.json({ ok: true, items });
}

/**
 * POST /api/chita/track — `{ updates: [{ orderNumber, stage }] }`.
 * Writes chitaStage/chitaStageAt only when the text changed, and sets
 * chitaDeliveredAt when the stage means "נמסר". It never touches the order's
 * own status and sends nothing to the customer. Answers
 * `{ ok: true, changed: <n> }`.
 */
export async function POST(req: Request) {
  const denied = chitaBotUnauthorized(req);
  if (denied) return denied;
  let body: { updates?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }
  if (!Array.isArray(body.updates)) return NextResponse.json({ ok: false, error: "updates required" }, { status: 400 });

  const now = new Date();
  let changed = 0;
  for (const u of body.updates.slice(0, 200) as { orderNumber?: unknown; stage?: unknown }[]) {
    const orderNumber = typeof u?.orderNumber === "string" ? u.orderNumber : "";
    const stage = typeof u?.stage === "string" ? u.stage.trim().slice(0, 120) : "";
    if (!orderNumber || !stage) continue;
    const r = await db.order.updateMany({
      where: { orderNumber, chitaStatus: "DONE", OR: [{ chitaStage: null }, { chitaStage: { not: stage } }] },
      data: {
        chitaStage: stage,
        chitaStageAt: now,
        ...(stageMeansDelivered(stage) ? { chitaDeliveredAt: now } : {}),
      },
    });
    changed += r.count;
  }
  return NextResponse.json({ ok: true, changed });
}
