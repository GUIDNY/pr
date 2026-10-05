import "server-only";
import { db } from "@/lib/db";
import { SITE_URL } from "@/lib/site-url";
import { emailChannel } from "./channels";
import { ownerAlertRecipients, ownerPushConfigured, pushToOwnerDevices } from "./owner-alert";
import {
  COMPLAINT_CATEGORY_LABELS,
  COMPLAINT_SEVERITY_LABELS,
  type ComplaintCategory,
  type ComplaintSeverity,
} from "@/lib/enums";

/**
 * Telling the shop that a complaint came in.
 *
 * It did not exist until a customer opened ticket #1000 and nobody found
 * out: the ingest endpoint wrote the row, the complaints tab showed it, and
 * that was the whole mechanism — a screen somebody has to think to open.
 * An order sends a push and a mail the moment it lands; a person who is
 * already unhappy got less than that.
 *
 * It is the same two lanes as the order alert and deliberately not a
 * WhatsApp message to the owner. Meta lets a business open a conversation
 * only with a template it approved in advance, so a WhatsApp alert would be
 * a template to write, submit and wait for — and the push already reaches
 * the same phone in the same second, without asking Meta's permission to
 * tell the owner about his own shop.
 *
 * Never throws. It runs on the ingest path, which runs after the customer
 * already has the bot's answer, and the rule there is that everything after
 * that answer can fail without the customer noticing.
 */

/** Digits as a dialable Israeli number: 972512544024 → 051-2544024. */
function localPhone(waId: string): string {
  const digits = waId.replace(/\D/g, "");
  return digits.startsWith("972") ? `0${digits.slice(3)}` : digits;
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type AlertReason = "NEW" | "ESCALATED";

export async function notifyOwnerOfComplaint(
  complaintId: string,
  reason: AlertReason = "NEW",
): Promise<void> {
  const recipients = ownerAlertRecipients();
  const mail = recipients.length > 0 && emailChannel.configured();
  const push = ownerPushConfigured();
  if (!mail && !push) return;

  const complaint = await db.complaint.findUnique({
    where: { id: complaintId },
    select: {
      id: true,
      ticketNumber: true,
      waId: true,
      customerName: true,
      subject: true,
      severity: true,
      category: true,
      /* The whole thread, not just the opening line. A ticket opened by a
         customer answering "כן" to the bot's offer says nothing on its own,
         and that is exactly the alert where the owner needs the messages
         around it to know whether to pick up the phone. */
      messages: {
        orderBy: { createdAt: "asc" },
        take: 12,
        select: { role: true, body: true },
      },
    },
  });
  if (!complaint) return;

  const who = complaint.customerName?.trim() || "לקוח";
  const phone = localPhone(complaint.waId);
  const severity = COMPLAINT_SEVERITY_LABELS[complaint.severity as ComplaintSeverity] ?? complaint.severity;
  const category = COMPLAINT_CATEGORY_LABELS[complaint.category as ComplaintCategory] ?? complaint.category;
  const link = `${SITE_URL}/admin/complaints/${complaint.id}`;
  const heading =
    reason === "ESCALATED"
      ? `פנייה הוחמרה · ${severity} · #${complaint.ticketNumber}`
      : `פנייה חדשה · ${severity} · #${complaint.ticketNumber}`;

  const said = complaint.messages
    .filter((m) => m.role === "CUSTOMER")
    .map((m) => m.body.trim())
    .filter(Boolean)
    .join(" | ");

  await Promise.all([
    push
      ? pushToOwnerDevices(
          heading,
          [who, phone, category, said.slice(0, 160)].filter(Boolean).join(" · "),
          "buytoday-complaints",
        ).catch(() => undefined)
      : null,
    mail ? mailOwner() : null,
  ]);

  async function mailOwner() {
    const thread = complaint!.messages
      .map(
        (m) =>
          `<tr><td style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${
            m.role === "CUSTOMER" ? "#1f2328" : "#6b7280"
          };"><strong>${m.role === "CUSTOMER" ? esc(who) : "אלפרד"}:</strong> ${esc(m.body)}</td></tr>`,
      )
      .join("");
    const html = `<!DOCTYPE html><html dir="rtl" lang="he"><body dir="rtl" style="margin:0;padding:24px;background:#f5f4f2;direction:rtl;">
<table role="presentation" dir="rtl" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:14px;padding:24px;direction:rtl;text-align:right;">
<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:19px;font-weight:bold;color:#1f2328;padding-bottom:4px;">${esc(heading)}</td></tr>
<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#6b7280;padding-bottom:14px;">${esc(who)} · <a href="tel:${esc(phone)}" style="color:#f55305;text-decoration:none;">${esc(phone)}</a> · ${esc(category)}</td></tr>
<tr><td><table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f4f2;border-radius:10px;padding:12px 14px;">${thread}</table></td></tr>
<tr><td style="padding-top:18px;"><a href="${esc(link)}" style="display:inline-block;background:#f55305;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;text-decoration:none;padding:11px 22px;border-radius:9px;">פתיחת הפנייה</a></td></tr>
</table></body></html>`;
    const text = [
      heading,
      `${who} · ${phone} · ${category}`,
      "",
      ...complaint!.messages.map((m) => `${m.role === "CUSTOMER" ? who : "אלפרד"}: ${m.body}`),
      "",
      link,
    ].join("\n");
    await Promise.all(
      recipients.map((to) =>
        emailChannel.send(to, { subject: `${heading} · ${who}`, body: text, html }).catch(() => undefined),
      ),
    );
  }
}
