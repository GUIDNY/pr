import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What the success page polls while the server-side callback catches up — the
 * customer's browser often gets back a second or two before Pelecard's
 * notification arrives.
 *
 * Returns the payment status and nothing else. No amounts, no approval number,
 * no card details: this endpoint takes an order number and no proof of who is
 * asking, so it must not be a way to read someone else's order.
 */
export async function GET(req: Request) {
  const orderNumber = new URL(req.url).searchParams.get("order");
  if (!orderNumber) return NextResponse.json({ error: "order is required" }, { status: 400 });

  const order = await db.order.findUnique({
    where: { orderNumber },
    select: { paymentStatus: true },
  });
  if (!order) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({ paymentStatus: order.paymentStatus });
}
