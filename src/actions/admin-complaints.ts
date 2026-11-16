"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { signedComplaintMediaUrl } from "@/lib/complaints/media";
import {
  complaintStatusSchema,
  complaintSeveritySchema,
  complaintCategorySchema,
  COMPLAINT_STATUS_LABELS,
  COMPLAINT_SEVERITY_LABELS,
  type ComplaintStatus,
} from "@/lib/enums";
import { isServiceWindowOpen } from "@/lib/complaints/service-window";

// Everything a person can do to a complaint from the admin.
//
// One path reaches the customer, and only one: sendComplaintWhatsAppReply,
// which the owner asked for on 16 November so a person's answer can go out
// on WhatsApp. It sends exactly the text the person typed — never a ticket
// number, never "your complaint" — through the n8n bot, which owns the
// WhatsApp connection and logs the sent message back through
// /api/internal/complaints/[ticketNumber]/reply-log. Notes, status,
// severity and assignment stay internal as before.

async function noteSystemEvent(complaintId: string, body: string) {
  await db.complaintMessage.create({
    data: { complaintId, role: "SYSTEM", body, internalOnly: true },
  });
}

export async function setComplaintStatusAction(id: string, next: string) {
  const session = await requireAdmin();
  const parsed = complaintStatusSchema.safeParse(next);
  if (!parsed.success) return { success: false, error: "סטטוס לא מוכר" };

  const before = await db.complaint.findUnique({ where: { id }, select: { status: true } });
  if (!before) return { success: false, error: "התלונה לא נמצאה" };
  if (before.status === parsed.data) return { success: true, error: null };

  const status = parsed.data as ComplaintStatus;
  await db.complaint.update({
    where: { id },
    data: {
      status,
      // Stamped when it is reached and cleared when it is left, so the
      // "resolved this week" figure counts what actually closed rather than
      // what was closed once and reopened.
      resolvedAt: status === "RESOLVED" || status === "CLOSED" ? new Date() : null,
    },
  });
  await noteSystemEvent(
    id,
    `הסטטוס שונה מ"${COMPLAINT_STATUS_LABELS[before.status as ComplaintStatus]}" ל"${COMPLAINT_STATUS_LABELS[status]}" על ידי ${session.name}`,
  );
  await logAudit({
    actorId: session.sub,
    action: "COMPLAINT_STATUS_CHANGED",
    entityType: "Complaint",
    entityId: id,
    metadata: { from: before.status, to: status },
  });
  revalidatePath(`/admin/complaints/${id}`);
  revalidatePath("/admin/complaints");
  return { success: true, error: null };
}

export async function setComplaintSeverityAction(id: string, next: string) {
  const session = await requireAdmin();
  const parsed = complaintSeveritySchema.safeParse(next);
  if (!parsed.success) return { success: false, error: "חומרה לא מוכרת" };

  const before = await db.complaint.findUnique({ where: { id }, select: { severity: true } });
  if (!before) return { success: false, error: "התלונה לא נמצאה" };
  if (before.severity === parsed.data) return { success: true, error: null };

  // A person may lower the severity; the automatic derivation may not. That
  // asymmetry is the point — someone who read the thread knows something the
  // rules do not.
  await db.complaint.update({ where: { id }, data: { severity: parsed.data } });
  await noteSystemEvent(
    id,
    `החומרה שונתה מ"${COMPLAINT_SEVERITY_LABELS[before.severity as keyof typeof COMPLAINT_SEVERITY_LABELS]}" ל"${COMPLAINT_SEVERITY_LABELS[parsed.data]}" על ידי ${session.name}`,
  );
  await logAudit({
    actorId: session.sub,
    action: "COMPLAINT_SEVERITY_CHANGED",
    entityType: "Complaint",
    entityId: id,
    metadata: { from: before.severity, to: parsed.data },
  });
  revalidatePath(`/admin/complaints/${id}`);
  revalidatePath("/admin/complaints");
  return { success: true, error: null };
}

export async function setComplaintCategoryAction(id: string, next: string) {
  const session = await requireAdmin();
  const parsed = complaintCategorySchema.safeParse(next);
  if (!parsed.success) return { success: false, error: "קטגוריה לא מוכרת" };

  const before = await db.complaint.findUnique({ where: { id }, select: { category: true } });
  if (!before) return { success: false, error: "התלונה לא נמצאה" };
  if (before.category === parsed.data) return { success: true, error: null };

  await db.complaint.update({ where: { id }, data: { category: parsed.data } });
  await logAudit({
    actorId: session.sub,
    action: "COMPLAINT_CATEGORY_CHANGED",
    entityType: "Complaint",
    entityId: id,
    metadata: { from: before.category, to: parsed.data },
  });
  revalidatePath(`/admin/complaints/${id}`);
  revalidatePath("/admin/complaints");
  return { success: true, error: null };
}

export async function assignComplaintAction(id: string, assignedToId: string | null) {
  const session = await requireAdmin();
  const target = assignedToId
    ? await db.user.findFirst({
        where: { id: assignedToId, role: { in: ["ADMIN", "STAFF"] } },
        select: { id: true, name: true },
      })
    : null;
  if (assignedToId && !target) return { success: false, error: "אפשר לשייך רק לחבר צוות" };

  await db.complaint.update({ where: { id }, data: { assignedToId: target?.id ?? null } });
  await noteSystemEvent(id, target ? `הפנייה שויכה ל${target.name} על ידי ${session.name}` : `השיוך הוסר על ידי ${session.name}`);
  await logAudit({
    actorId: session.sub,
    action: "COMPLAINT_ASSIGNED",
    entityType: "Complaint",
    entityId: id,
    metadata: { assignedToId: target?.id ?? null },
  });
  revalidatePath(`/admin/complaints/${id}`);
  revalidatePath("/admin/complaints");
  return { success: true, error: null };
}

export async function addComplaintNoteAction(id: string, body: string) {
  const session = await requireAdmin();
  const text = body.trim();
  if (!text) return { success: false, error: "אין מה לשמור" };

  // Internal, like every other message in this thread. Nothing in this
  // codebase sends a ComplaintMessage to WhatsApp.
  await db.complaintMessage.create({
    data: { complaintId: id, role: "STAFF", body: text, authorId: session.sub, internalOnly: true },
  });
  revalidatePath(`/admin/complaints/${id}`);
  return { success: true, error: null };
}

export async function linkComplaintToOrderAction(id: string, orderNumber: string) {
  const session = await requireAdmin();
  const trimmed = orderNumber.trim();
  if (!trimmed) {
    await db.complaint.update({ where: { id }, data: { orderId: null } });
    revalidatePath(`/admin/complaints/${id}`);
    return { success: true, error: null };
  }
  const order = await db.order.findFirst({ where: { orderNumber: trimmed }, select: { id: true } });
  if (!order) return { success: false, error: `לא נמצאה הזמנה ${trimmed}` };

  await db.complaint.update({ where: { id }, data: { orderId: order.id } });
  await noteSystemEvent(id, `הפנייה נקשרה להזמנה ${trimmed} על ידי ${session.name}`);
  await logAudit({
    actorId: session.sub,
    action: "COMPLAINT_LINKED_TO_ORDER",
    entityType: "Complaint",
    entityId: id,
    metadata: { orderNumber: trimmed },
  });
  revalidatePath(`/admin/complaints/${id}`);
  return { success: true, error: null };
}

/**
 * A short-lived link to a file the customer sent. Minted per click rather
 * than rendered into the page, so a URL that leaves this screen — pasted
 * into a chat, left in a browser history — is useless within ten minutes.
 */
export async function complaintMediaUrlAction(messageId: string) {
  await requireAdmin();
  const message = await db.complaintMessage.findUnique({
    where: { id: messageId },
    select: { mediaStoragePath: true },
  });
  if (!message?.mediaStoragePath) return { url: null };
  return { url: await signedComplaintMediaUrl(message.mediaStoragePath) };
}

/**
 * Hands a person's reply to n8n, which sends it on WhatsApp. Refuses outside
 * Meta's 24-hour window (free text would bounce there) and says so plainly
 * when the webhook is not configured rather than failing somewhere unseen.
 * Nothing is written here: the thread gets the message when n8n logs what
 * WhatsApp actually accepted.
 */
export async function sendComplaintWhatsAppReplyAction(
  id: string,
  text: string,
): Promise<{ success: boolean; error: string | null }> {
  const session = await requireAdmin();
  const body = text.trim();
  if (!body) return { success: false, error: "אין טקסט לשליחה" };
  if (body.length > 4000) return { success: false, error: "ההודעה ארוכה מדי (עד 4,000 תווים)" };

  const webhook = process.env.N8N_COMPLAINT_REPLY_WEBHOOK;
  const key = process.env.INTERNAL_API_KEY;
  if (!webhook || !key) return { success: false, error: "שליחה בוואטסאפ לא מוגדרת" };

  const complaint = await db.complaint.findUnique({
    where: { id },
    select: {
      ticketNumber: true,
      channel: true,
      messages: { where: { role: "CUSTOMER" }, orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
    },
  });
  if (!complaint) return { success: false, error: "הפנייה לא נמצאה" };
  if (complaint.channel !== "WHATSAPP") return { success: false, error: "הפנייה לא הגיעה מוואטסאפ" };
  if (!isServiceWindowOpen(complaint.messages[0]?.createdAt ?? null)) {
    return { success: false, error: "עברו 24 שעות מההודעה האחרונה של הלקוח — צריך להתקשר" };
  }

  let response: Response;
  try {
    response = await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-key": key },
      body: JSON.stringify({ ticketNumber: complaint.ticketNumber, text: body, author: session.sub }),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
  } catch (e) {
    const reason = e instanceof Error && e.name === "TimeoutError" ? "אין תשובה מ-n8n תוך 20 שניות" : "n8n לא זמין";
    return { success: false, error: reason };
  }
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 200);
    return { success: false, error: `n8n החזיר ${response.status}${detail ? `: ${detail}` : ""}` };
  }

  await logAudit({
    actorId: session.sub,
    action: "COMPLAINT_WHATSAPP_REPLY_SENT",
    entityType: "Complaint",
    entityId: id,
    metadata: { ticketNumber: complaint.ticketNumber, length: body.length },
  });
  revalidatePath(`/admin/complaints/${id}`);
  return { success: true, error: null };
}
