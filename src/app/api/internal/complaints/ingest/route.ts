import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { redactSensitive } from "@/lib/complaints/redact";
import { deriveSeverity, raiseSeverity, deriveCategory, deriveSubject } from "@/lib/complaints/severity";
import { storeComplaintMedia } from "@/lib/complaints/media";
import {
  CLOSED_COMPLAINT_STATUSES,
  COMPLAINT_OPENING_INTENTS,
  type BotIntent,
  type ComplaintSeverity,
} from "@/lib/enums";

// Where a WhatsApp conversation becomes a complaint.
//
// The rule that shapes every decision in this file: THE CUSTOMER IS NEVER
// TOLD THIS EXISTS. No ticket number reaches them, no "we have opened a
// case", no change in how the bot answers, no clue at all. Which means:
//
//   • The bot calls this AFTER it has already sent its reply, on a path the
//     reply does not depend on. Everything below can fail — the database,
//     the storage bucket, this whole route — and the customer's conversation
//     is exactly what it would have been. That is why nothing here is in the
//     reply path and why this endpoint never returns text to echo back.
//   • Nothing here is ever quoted to a customer. The response carries ids
//     and flags, deliberately no message content, so a caller that logs the
//     response cannot leak the thread.
//   • The model's own prompt says nothing about complaints or tickets. A
//     model that does not know the system exists cannot mention it. That
//     half lives in n8n and is the bot owner's, not this repo's.
//
// The endpoint is idempotent on waMessageId, because n8n retries.
export const dynamic = "force-dynamic";

type IngestBody = {
  waId?: string;
  customerName?: string | null;
  waMessageId?: string | null;
  customerText?: string | null;
  botReply?: string | null;
  intent?: string | null;
  confidence?: number | null;
  needsHuman?: boolean | null;
  mediaMime?: string | null;
  mediaBase64?: string | null;
  occurredAt?: string | null;
};

// How long a quiet conversation stays the same complaint. Past this, a new
// message is a new subject rather than the old one resumed — a customer who
// went quiet for four days and comes back is usually asking about something
// else, and stapling it to a stale thread hides both.
const THREAD_WINDOW_HOURS = 72;

function unauthorized() {
  // No detail, on purpose: this endpoint is not reachable from a browser and
  // an attacker learns nothing from the answer.
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

function checkInternalKey(request: Request): boolean {
  const expected = process.env.INTERNAL_API_KEY;
  if (!expected || expected.length < 32) return false;
  const given = request.headers.get("x-internal-key") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, so the lengths are compared
  // first — and a wrong length is already a wrong key.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function parseDate(value: string | null | undefined): Date {
  if (!value) return new Date();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/** Digits only, no plus — the form WhatsApp itself uses. */
function normalizeWaId(value: string): string {
  return value.replace(/\D/g, "");
}

export async function POST(request: Request) {
  if (!checkInternalKey(request)) return unauthorized();

  let body: IngestBody;
  try {
    body = (await request.json()) as IngestBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const waId = normalizeWaId(String(body.waId ?? ""));
  if (!waId) return NextResponse.json({ error: "waId is required" }, { status: 400 });

  const nothingHappened = { created: false, appended: false, complaintId: null, ticketNumber: null, severity: null };

  const waMessageId = body.waMessageId?.trim() || null;
  // Idempotency first, before anything is derived or written. A retry costs
  // one indexed lookup and changes nothing.
  if (waMessageId) {
    const seen = await db.complaintMessage.findUnique({
      where: { waMessageId },
      select: { complaintId: true, complaint: { select: { ticketNumber: true, severity: true } } },
    });
    if (seen) {
      return NextResponse.json({
        created: false,
        appended: false,
        complaintId: seen.complaintId,
        ticketNumber: seen.complaint.ticketNumber,
        severity: seen.complaint.severity,
      });
    }
  }

  const occurredAt = parseDate(body.occurredAt);
  const rawCustomerText = (body.customerText ?? "").trim();
  const rawBotReply = (body.botReply ?? "").trim();
  const intent = (body.intent ?? "other") as BotIntent;
  const needsHuman = body.needsHuman === true;

  const windowStart = new Date(occurredAt.getTime() - THREAD_WINDOW_HOURS * 60 * 60 * 1000);
  const existing = await db.complaint.findFirst({
    where: {
      waId,
      status: { notIn: CLOSED_COMPLAINT_STATUSES },
      lastMessageAt: { gte: windowStart },
    },
    orderBy: { lastMessageAt: "desc" },
    select: { id: true, ticketNumber: true, severity: true, customerName: true },
  });

  // The gate is on OPENING only. Once a complaint is open every later
  // message from that number joins it whatever its intent — a "תודה" and a
  // question about a different product are both part of the story, and a
  // thread with the calm parts filtered out misleads whoever reads it.
  if (!existing && !needsHuman && !COMPLAINT_OPENING_INTENTS.includes(intent)) {
    return NextResponse.json(nothingHappened);
  }
  // Nothing to record at all.
  if (!existing && !rawCustomerText && !body.mediaBase64 && !body.mediaMime) {
    return NextResponse.json(nothingHappened);
  }

  const customer = redactSensitive(rawCustomerText);
  const bot = redactSensitive(rawBotReply);

  let complaintId: string;
  let ticketNumber: number;
  let severity: ComplaintSeverity;
  let created = false;

  if (existing) {
    complaintId = existing.id;
    ticketNumber = existing.ticketNumber;
    const customerMessageCount =
      (await db.complaintMessage.count({ where: { complaintId, role: "CUSTOMER" } })) + 1;
    severity = raiseSeverity(
      existing.severity as ComplaintSeverity,
      deriveSeverity({ text: customer.text, customerMessageCount }),
    );
    await db.complaint.update({
      where: { id: complaintId },
      data: {
        lastMessageAt: occurredAt,
        severity,
        // A name only ever fills a gap: whatever an admin typed stays.
        ...(existing.customerName ? {} : { customerName: body.customerName?.trim() || null }),
      },
    });
  } else {
    severity = deriveSeverity({ text: customer.text, customerMessageCount: 1 });
    // Matched to a user by phone where possible, so the complaint page can
    // show who this is and what they have ordered. waId carries the country
    // code and stored phones usually do not, so the last nine digits are
    // what actually line up.
    const tail = waId.slice(-9);
    const user = tail.length === 9
      ? await db.user.findFirst({ where: { phone: { endsWith: tail } }, select: { id: true } })
      : null;
    const complaint = await db.complaint.create({
      data: {
        waId,
        customerName: body.customerName?.trim() || null,
        userId: user?.id ?? null,
        channel: "WHATSAPP",
        category: deriveCategory(customer.text),
        severity,
        status: "OPEN",
        subject: deriveSubject(customer.text),
        firstMessageAt: occurredAt,
        lastMessageAt: occurredAt,
      },
      select: { id: true, ticketNumber: true },
    });
    complaintId = complaint.id;
    ticketNumber = complaint.ticketNumber;
    created = true;
  }

  // Media, once the complaint exists so the object can be filed under it.
  // A failure here is recorded as "the customer sent a file we did not
  // keep" rather than losing the message it came with.
  let mediaStoragePath: string | null = null;
  if (body.mediaBase64) {
    const stored = await storeComplaintMedia(complaintId, body.mediaBase64, body.mediaMime ?? null);
    if (stored.ok) mediaStoragePath = stored.path;
  }

  const messages: {
    complaintId: string;
    role: string;
    body: string;
    waMessageId?: string | null;
    mediaMime?: string | null;
    mediaStoragePath?: string | null;
    redactedFields?: string | null;
    createdAt: Date;
  }[] = [];

  if (customer.text || body.mediaMime) {
    messages.push({
      complaintId,
      role: "CUSTOMER",
      body: customer.text,
      waMessageId,
      mediaMime: body.mediaMime ?? null,
      mediaStoragePath,
      redactedFields: customer.redacted.length > 0 ? JSON.stringify(customer.redacted) : null,
      createdAt: occurredAt,
    });
  }
  if (bot.text) {
    messages.push({
      complaintId,
      role: "BOT",
      body: bot.text,
      // Only the customer's message carries the WhatsApp id; the reply is a
      // separate message with an id we are not given, and the column is
      // unique.
      waMessageId: null,
      redactedFields: bot.redacted.length > 0 ? JSON.stringify(bot.redacted) : null,
      // A millisecond after, so the thread always renders in the order it
      // happened rather than depending on insertion order.
      createdAt: new Date(occurredAt.getTime() + 1),
    });
  }

  if (messages.length > 0) {
    // createMany with skipDuplicates rather than a transaction: the unique
    // waMessageId is the guard, and two concurrent retries of the same
    // message must not make one of them 500.
    await db.complaintMessage.createMany({ data: messages, skipDuplicates: true });
  }

  return NextResponse.json({
    created,
    appended: !created,
    complaintId,
    ticketNumber,
    severity,
  });
}

// Anything but POST, including a browser wandering in.
export async function GET() {
  return unauthorized();
}
