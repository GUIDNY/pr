import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkInternalKey, parseTicketNumber, unauthorized } from "@/lib/complaints/internal-key";
import { isServiceWindowOpen } from "@/lib/complaints/service-window";

// What n8n needs before it sends a person's reply to the customer: where to
// send it, and whether Meta still allows free text. No message content —
// the same rule as ingest, so a caller that logs the response leaks nothing.
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ ticketNumber: string }> }) {
  if (!checkInternalKey(request)) return unauthorized();
  const ticketNumber = parseTicketNumber((await params).ticketNumber);
  if (ticketNumber === null) return NextResponse.json({ error: "bad ticket number" }, { status: 400 });

  const complaint = await db.complaint.findUnique({
    where: { ticketNumber },
    select: {
      ticketNumber: true,
      waId: true,
      customerName: true,
      status: true,
      messages: {
        where: { role: "CUSTOMER" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
    },
  });
  if (!complaint) return NextResponse.json({ error: "not found" }, { status: 404 });

  const lastCustomerMessageAt = complaint.messages[0]?.createdAt ?? null;
  return NextResponse.json({
    ticketNumber: complaint.ticketNumber,
    waId: complaint.waId,
    customerName: complaint.customerName,
    status: complaint.status,
    lastCustomerMessageAt,
    windowOpen: isServiceWindowOpen(lastCustomerMessageAt),
  });
}
