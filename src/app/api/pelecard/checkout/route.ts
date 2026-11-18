import { NextResponse } from "next/server";
import { openPelecardPayment } from "@/lib/pelecard/open-payment";
import { getCurrentUser } from "@/lib/auth";

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

  /* The account on the signed cookie decides the lane, so it is resolved here
     rather than taken from the request body — a browser that could name the
     address could name one on the live list. */
  const viewer = await getCurrentUser();
  const result = await openPelecardPayment(body.orderId, { viewer });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({ redirectUrl: result.redirectUrl, orderId: result.orderId });
}
