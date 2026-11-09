"use server";

import { db } from "@/lib/db";
import { requireBackOffice } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { emailChannel } from "@/lib/notify/channels";
import { waNumber } from "@/lib/notify/whatsapp-link";
import { hasMarketingConsent, unsubscribeUrl } from "@/lib/marketing-consent";
import { referralCodeFor, referralProgress } from "@/lib/referral";
import { REFERRAL_FRIEND_PERCENT, REFERRAL_MIN_ORDER, REFERRAL_REWARDS } from "@/lib/referral-rules";
import { BUSINESS } from "@/lib/business";
import { SITE_URL } from "@/lib/site-url";

type Result = { ok: true; whatsappUrl?: string; message: string } | { ok: false; error: string };

/**
 * Invite a past buyer to חבר מביא חבר — from the back office's order page.
 *
 * An advertisement under the spam law (lib/marketing-consent), so: only to
 * a buyer who ticked the marketing box, "פרסומת" first, the sender named,
 * and a working refusal link in every message. Refused, with the reason,
 * for everyone else — the panel says so before anyone presses anything.
 *
 * Email goes out through the shop's own channel. WhatsApp is a link that
 * opens a chat with the message typed in, sent by a person from the shop's
 * phone: a business may open a WhatsApp conversation through the API only
 * with a template Meta approved, and there is no approved marketing template.
 */
export async function sendReferralInviteAction(orderId: string, channel: "EMAIL" | "WHATSAPP"): Promise<Result> {
  const session = await requireBackOffice();
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      marketingOptIn: true,
      guestName: true,
      guestEmail: true,
      guestPhone: true,
      user: { select: { id: true, name: true, email: true, phone: true, marketingOptIn: true } },
    },
  });
  if (!order) return { ok: false, error: "ההזמנה לא נמצאה" };
  if (!hasMarketingConsent({ userMarketingOptIn: order.user?.marketingOptIn, orderMarketingOptIn: order.marketingOptIn })) {
    return { ok: false, error: "הלקוח לא אישר קבלת פרסומות — אסור לשלוח לו לפי חוק הספאם" };
  }
  const email = order.user?.email ?? order.guestEmail;
  const phone = order.user?.phone ?? order.guestPhone;
  const firstName = (order.user?.name ?? order.guestName ?? "").trim().split(/\s+/)[0] || "שלום";

  /* An account has a personal link; a guest is invited to open one, since
     the gift lands in the personal area. */
  const link = order.user
    ? `${SITE_URL}/r/${await referralCodeFor(order.user.id)}`
    : `${SITE_URL}/register`;
  const steps = REFERRAL_REWARDS.map((v, i) => `${i + 1}: ₪${v}`).join(" · ");
  const progress = order.user ? await referralProgress(order.user.id) : null;

  const lines = [
    `פרסומת: ${BUSINESS.name}`,
    `${firstName}, תודה שקניתם אצלנו!`,
    order.user
      ? `שתפו את הקישור האישי שלכם — כל חבר שנרשם דרכו מקבל ${REFERRAL_FRIEND_PERCENT}% הנחה, ואתם מקבלים מתנה לקנייה הבאה כשהוא קונה ב-${REFERRAL_MIN_ORDER} ₪ ומעלה (חבר ${steps}).`
      : `פתחו חשבון וקבלו קישור אישי לחברים — כל חבר שקונה דרכו מקבל ${REFERRAL_FRIEND_PERCENT}% הנחה, ואתם מקבלים מתנה לקנייה הבאה (חבר ${steps}).`,
    progress && progress.friends > 0 ? `כבר הבאתם ${progress.friends} — המתנה הבאה ₪${progress.nextReward}.` : null,
    link,
    `והמבצעים שלנו עכשיו: ${SITE_URL}/deals`,
  ].filter(Boolean) as string[];

  if (channel === "EMAIL") {
    if (!email) return { ok: false, error: "אין כתובת מייל בהזמנה" };
    if (!emailChannel.configured()) return { ok: false, error: "שליחת מיילים לא מוגדרת" };
    const unsub = unsubscribeUrl(email);
    const body = `${lines.join("\n\n")}\n\n—\nלהסרה מרשימת הדיוור: ${unsub}\n${BUSINESS.name} · ${BUSINESS.phone}`;
    const html = `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#222">
<p style="color:#888;font-size:12px">פרסומת · ${BUSINESS.name}</p>
<p><b>${escapeHtml(lines[1])}</b></p>
<p>${escapeHtml(lines[2])}</p>
${progress && progress.friends > 0 ? `<p>${escapeHtml(lines[3])}</p>` : ""}
<p><a href="${link}" style="display:inline-block;background:#f55305;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:bold">${order.user ? "לקישור האישי שלי" : "פתיחת חשבון"}</a></p>
<p style="font-size:13px;color:#555" dir="ltr">${link}</p>
<p><a href="${SITE_URL}/deals" style="color:#f55305;font-weight:bold">למבצעים שלנו עכשיו ←</a></p>
<hr style="border:none;border-top:1px solid #eee"/>
<p style="font-size:12px;color:#888">${BUSINESS.name} · ${BUSINESS.phone}<br/>
קיבלתם את ההודעה כי אישרתם קבלת מבצעים בהזמנה. <a href="${unsub}" style="color:#888">להסרה מרשימת הדיוור</a></p>
</div>`;
    const sent = await emailChannel.send(email, { subject: `פרסומת: מתנה על כל חבר שמביאים ל-${BUSINESS.name}`, body, html });
    if (!sent.ok) return { ok: false, error: `המייל לא נשלח: ${sent.error}` };
    await logAudit({ actorId: session.sub, action: "REFERRAL_INVITE", entityType: "Order", entityId: order.id, metadata: { channel, orderNumber: order.orderNumber } });
    return { ok: true, message: `נשלח מייל ל-${email}` };
  }

  const to = waNumber(phone);
  if (!to) return { ok: false, error: "אין מספר טלפון תקין בהזמנה" };
  const text = `${lines.join("\n\n")}\n\nלהסרה מקבלת מבצעים השיבו "הסר"${email ? ` או: ${unsubscribeUrl(email)}` : ""}`;
  await logAudit({ actorId: session.sub, action: "REFERRAL_INVITE", entityType: "Order", entityId: order.id, metadata: { channel, orderNumber: order.orderNumber } });
  return { ok: true, whatsappUrl: `https://wa.me/${to}?text=${encodeURIComponent(text)}`, message: "נפתח וואטסאפ עם ההודעה — שלחו אותה מהטלפון של העסק" };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
