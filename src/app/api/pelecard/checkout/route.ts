import { NextResponse } from "next/server";
import { openPelecardPayment } from "@/lib/pelecard/open-payment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Opens a Pelecard payment for an order that already exists, and hands back the
 * URL of Pelecard's own payment form.
 *
 * The work is in openPelecardPayment(), shared with the page that embeds that
 * form in a frame, so the two cannot drift.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { orderId?: string };
  if (!body.orderId) return NextResponse.json({ error: "orderId is required" }, { status: 400 });

  const result = await openPelecardPayment(body.orderId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({ redirectUrl: result.redirectUrl, orderId: result.orderId });
}
