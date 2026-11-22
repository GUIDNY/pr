"use server";

import { randomInt } from "crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireBackOffice } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { newThanksCode, thanksName, THANKS_DAYS, THANKS_PERCENT } from "@/lib/thanks-coupon";

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

  const name = thanksName(order.orderNumber);
  const existing = await db.promotion.findFirst({ where: { name }, select: { code: true, endsAt: true } });
  if (existing?.code && existing.endsAt) {
    return { success: true as const, code: existing.code, endsAt: existing.endsAt.toISOString(), created: false as const };
  }

  let code = newThanksCode((n) => randomInt(n));
  for (let i = 0; i < 5 && (await db.promotion.findUnique({ where: { code } })); i++) code = newThanksCode((n) => randomInt(n));
  const endsAt = new Date(Date.now() + THANKS_DAYS * 86_400_000);
  await db.promotion.create({
    data: {
      name,
      code,
      description: `${THANKS_PERCENT}% הנחה, תודה`,
      type: "PERCENTAGE",
      value: THANKS_PERCENT,
      scope: "CART",
      startsAt: new Date(),
      endsAt,
      isActive: true,
      usageLimit: 1,
      perCustomerLimit: 1,
    },
  });
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
