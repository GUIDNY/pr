"use server";

import { db } from "@/lib/db";
import { requireBackOffice } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { emailChannel } from "@/lib/notify/channels";
import { waNumber } from "@/lib/notify/whatsapp-link";
import { reviewUrl } from "@/lib/review-link";
import { BUSINESS } from "@/lib/business";

type Result = { ok: true; whatsappUrl?: string; message: string } | { ok: false; error: string };

/**
 * A week after a purchase: ask for a review.
 *
 * A service message, not an advertisement — it is about the order the
 * customer placed, it asks for their opinion and it offers nothing — so it
 * may go to every buyer, with or without marketing consent. That holds only
 * while it stays this way: a discount, a coupon or a "see our deals" line
 * added here would turn it into an advertisement under §30A, and then it
 * belongs in actions/referral-invite.ts with the consent check.
 */
export async function sendReviewRequestAction(orderId: string, channel: "EMAIL" | "WHATSAPP"): Promise<Result> {
  const session = await requireBackOffice();
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      guestName: true,
      guestEmail: true,
      guestPhone: true,
      user: { select: { name: true, email: true, phone: true } },
    },
  });
  if (!order) return { ok: false, error: "ההזמנה לא נמצאה" };
  const firstName = (order.user?.name ?? order.guestName ?? "").trim().split(/\s+/)[0] || "שלום";
  const link = reviewUrl(order.orderNumber);
  const text = `${firstName}, תודה שקניתם ב-${BUSINESS.name}! איך המוצר מהזמנה ${order.orderNumber}? נשמח לדירוג קצר — לוקח דקה:\n${link}`;

  if (channel === "EMAIL") {
    const email = order.user?.email ?? order.guestEmail;
    if (!email) return { ok: false, error: "אין כתובת מייל בהזמנה" };
    if (!emailChannel.configured()) return { ok: false, error: "שליחת מיילים לא מוגדרת" };
    const html = `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#222">
<p><b>${firstName}, תודה שקניתם ב-${BUSINESS.name}!</b></p>
<p>איך המוצר מהזמנה ${order.orderNumber}? דירוג קצר עוזר ללקוחות הבאים לבחור נכון.</p>
<p><a href="${link}" style="display:inline-block;background:#f55305;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:bold">★★★★★ לדירוג המוצר</a></p>
<p style="font-size:12px;color:#888">${BUSINESS.name} · ${BUSINESS.phone}</p></div>`;
    const sent = await emailChannel.send(email, { subject: `איך היה? הזמנה ${order.orderNumber}`, body: text, html });
    if (!sent.ok) return { ok: false, error: `המייל לא נשלח: ${sent.error}` };
    await logAudit({ actorId: session.sub, action: "REVIEW_REQUEST", entityType: "Order", entityId: order.id, metadata: { channel } });
    return { ok: true, message: `נשלח מייל ל-${email}` };
  }

  const to = waNumber(order.user?.phone ?? order.guestPhone);
  if (!to) return { ok: false, error: "אין מספר טלפון תקין בהזמנה" };
  await logAudit({ actorId: session.sub, action: "REVIEW_REQUEST", entityType: "Order", entityId: order.id, metadata: { channel } });
  return { ok: true, whatsappUrl: `https://wa.me/${to}?text=${encodeURIComponent(text)}`, message: "נפתח וואטסאפ עם ההודעה — שלחו מהטלפון של העסק" };
}
