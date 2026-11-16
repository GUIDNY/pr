import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkInternalKey, parseTicketNumber, unauthorized } from "@/lib/complaints/internal-key";

// n8n calls this after WhatsApp accepted a person's reply, so the thread in
// the admin shows what the customer actually received. Idempotent on
// waMessageId, because n8n retries.
export const dynamic = "force-dynamic";

type ReplyLogBody = { text?: string; waMessageId?: string; author?: string | null };

/**
 * `author` is either an admin user id (a reply sent from the admin box) or
 * the WhatsApp number of whoever answered from the business phone. Either
 * way it becomes a user id when one matches; a number that matches nobody
 * leaves the message without an author rather than inventing one.
 */
async function resolveAuthor(author: string | null | undefined): Promise<string | null> {
  const value = author?.trim();
  if (!value) return null;
  const byId = await db.user.findUnique({ where: { id: value }, select: { id: true } });
  if (byId) return byId.id;
  const tail = value.replace(/\D/g, "").slice(-9);
  if (tail.length !== 9) return null;
  const byPhone = await db.user.findFirst({
    where: { phone: { endsWith: tail }, role: { in: ["ADMIN", "STAFF"] } },
    select: { id: true },
  });
  return byPhone?.id ?? null;
}

export async function POST(request: Request, { params }: { params: Promise<{ ticketNumber: string }> }) {
  if (!checkInternalKey(request)) return unauthorized();
  const ticketNumber = parseTicketNumber((await params).ticketNumber);
  if (ticketNumber === null) return NextResponse.json({ error: "bad ticket number" }, { status: 400 });

  let body: ReplyLogBody;
  try {
    body = (await request.json()) as ReplyLogBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const text = (body.text ?? "").trim();
  const waMessageId = body.waMessageId?.trim() || null;
  if (!text) return NextResponse.json({ error: "text is required" }, { status: 400 });
  if (!waMessageId) return NextResponse.json({ error: "waMessageId is required" }, { status: 400 });

  const seen = await db.complaintMessage.findUnique({
    where: { waMessageId },
    select: { id: true, complaint: { select: { ticketNumber: true, status: true } } },
  });
  if (seen) {
    return NextResponse.json({
      logged: false,
      duplicate: true,
      messageId: seen.id,
      ticketNumber: seen.complaint.ticketNumber,
      status: seen.complaint.status,
    });
  }

  const complaint = await db.complaint.findUnique({ where: { ticketNumber }, select: { id: true, status: true } });
  if (!complaint) return NextResponse.json({ error: "not found" }, { status: 404 });

  const now = new Date();
  const authorId = await resolveAuthor(body.author);
  // A first human answer moves an untouched ticket into handling; any later
  // status is a person's decision and a reply does not overrule it.
  const status = complaint.status === "OPEN" ? "IN_PROGRESS" : complaint.status;

  const created = await db.complaintMessage.createManyAndReturn({
    data: [{ complaintId: complaint.id, role: "STAFF", body: text, authorId, waMessageId, internalOnly: false, createdAt: now }],
    skipDuplicates: true,
    select: { id: true },
  });
  if (created.length === 0) {
    // Two retries raced; the other one wrote it.
    return NextResponse.json({ logged: false, duplicate: true, ticketNumber, status: complaint.status });
  }
  await db.complaint.update({ where: { id: complaint.id }, data: { lastMessageAt: now, status } });

  return NextResponse.json({
    logged: true,
    duplicate: false,
    messageId: created[0].id,
    ticketNumber,
    status,
    authorResolved: authorId !== null,
  });
}
