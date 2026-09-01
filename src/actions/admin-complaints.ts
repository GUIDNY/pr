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

// Everything a person can do to a complaint from the admin.
//
// What is deliberately absent: any way to send a message to the customer.
// A staff note is written to the thread and stops there — there is no
// WhatsApp send in this file, no template, no queue. Replying to a customer
// from the admin is a real feature with real consequences (the customer
// would learn a complaint exists, which is the one thing this whole design
// is built to avoid) and it needs its own decision, not a quiet arrival
// through a helper nobody reviewed.

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
