"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireBackOffice } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { thanksName, shortProduct } from "@/lib/thanks-coupon";
import { getOrCreateThanksCoupon } from "@/lib/thanks-coupon-db";
import { whatsappChannel, thanksTemplateReady } from "@/lib/notify/channels";
import { firstNameOf } from "@/lib/notify/wa-reminder";

const SENT_STATUSES = ["SHIPPED", "DELIVERED"];

/**
 * "צור קופון ושלח": makes the order's thank-you coupon, once. A second click
 * on the same order returns the coupon that already exists instead of making
 * another, so the owner can reopen the message without minting a new code.
 */
export async function createThanksCouponAction(orderId: string) {
  const session = await requireBackOffice();
  const order = await db.order.findUnique({ where: { id: orderId }, select: { orderNumber: true, status: true } });
  if (!order) return { success: false as const, error: "הזמנה לא נמצאה" };
  if (!SENT_STATUSES.includes(order.status)) return { success: false as const, error: "ההזמנה עדיין לא נשלחה ללקוח" };

  const made = await getOrCreateThanksCoupon(order.orderNumber);
  if (!made.created) {
    return { success: true as const, code: made.code, endsAt: made.endsAt.toISOString(), created: false as const };
  }
  const { code, endsAt } = made;
  await logAudit({ actorId: session.sub, action: "THANKS_COUPON_CREATED", entityType: "Order", entityId: orderId, metadata: { code } });
  revalidatePath("/admin/promotions");
  return { success: true as const, code, endsAt: endsAt.toISOString(), created: true as const };
}

/** Opened in WhatsApp: noted on the order so it is not sent twice. */
export async function recordThanksCouponSentAction(orderId: string, code: string) {
  const session = await requireBackOffice();
  const order = await db.order.findUnique({ where: { id: orderId }, select: { orderNumber: true } });
  if (!order) return { success: false, error: "הזמנה לא נמצאה" };
  const promo = await db.promotion.findFirst({ where: { code, name: thanksName(order.orderNumber) }, select: { id: true } });
  if (!promo) return { success: false, error: "קופון לא שייך להזמנה" };
  await db.orderNote.create({ data: { orderId, authorId: session.sub, body: `נשלח קופון ${code}`, isInternal: true } });
  revalidatePath(`/admin/orders/${order.orderNumber}`);
  revalidatePath("/admin/orders");
  return { success: true, error: null };
}

const untilIL = (d: Date) =>
  new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);

/**
 * "שלח מהבוט": the thank-you template (thank_you_coupon_he) through the
 * WhatsApp Business API, to a customer who agreed to WhatsApp, with the
 * order's coupon (made here only if the order has none). One send per order:
 * the OrderNotification row is the lock, and a failed send gives it back so
 * the owner can try again. Noted on the order with Meta's message id.
 */
export async function sendThanksCouponFromBotAction(orderId: string) {
  const session = await requireBackOffice();
  if (!thanksTemplateReady()) return { success: false as const, error: "ממתין לאישור Meta" };
  if (!whatsappChannel.configured()) return { success: false as const, error: "וואטסאפ לא מוגדר בשרת" };

  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      orderNumber: true,
      status: true,
      guestName: true,
      guestPhone: true,
      whatsappOptIn: true,
      user: { select: { name: true, phone: true } },
      items: { select: { titleSnap: true }, take: 1 },
    },
  });
  if (!order) return { success: false as const, error: "הזמנה לא נמצאה" };
  if (!SENT_STATUSES.includes(order.status)) return { success: false as const, error: "ההזמנה עדיין לא נשלחה ללקוח" };
  if (order.whatsappOptIn !== true) return { success: false as const, error: "הלקוח לא אישר וואטסאפ" };
  const phone = order.user?.phone ?? order.guestPhone;
  if (!phone) return { success: false as const, error: "אין טלפון להזמנה" };

  try {
    await db.orderNotification.create({ data: { orderId, channel: "WHATSAPP", event: "THANK_COUPON", recipient: phone } });
  } catch {
    return { success: false as const, error: "כבר נשלח קופון מהבוט להזמנה הזאת" };
  }

  const release = () => db.orderNotification.deleteMany({ where: { orderId, channel: "WHATSAPP", event: "THANK_COUPON", status: { not: "SENT" } } });
  try {
    const { code, endsAt } = await getOrCreateThanksCoupon(order.orderNumber);
    const total = await db.order.findUnique({ where: { id: orderId }, select: { items: { select: { id: true } } } });
    const product = shortProduct(order.items[0]?.titleSnap ?? "", (total?.items.length ?? 1) - 1);
    const result = await whatsappChannel.send(phone, {
      subject: "",
      body: "",
      template: { event: "THANK_COUPON", params: [firstNameOf(order.user?.name ?? order.guestName), product, code, untilIL(endsAt)] },
    });
    if (!result.ok) {
      await release();
      return { success: false as const, error: result.error };
    }
    await db.orderNotification.updateMany({
      where: { orderId, channel: "WHATSAPP", event: "THANK_COUPON" },
      data: { status: "SENT", sentAt: new Date(), providerMessageId: result.providerMessageId ?? null },
    });
    await db.orderNote.create({
      data: { orderId, authorId: session.sub, body: `נשלח קופון ${code} מהבוט${result.providerMessageId ? ` (${result.providerMessageId})` : ""}`, isInternal: true },
    });
    await logAudit({ actorId: session.sub, action: "THANKS_COUPON_SENT_BOT", entityType: "Order", entityId: orderId, metadata: { code } });
    revalidatePath(`/admin/orders/${order.orderNumber}`);
    return { success: true as const, code };
  } catch (error) {
    await release().catch(() => undefined);
    return { success: false as const, error: error instanceof Error ? error.message : "השליחה נכשלה" };
  }
}
