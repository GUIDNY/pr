import "server-only";
import { db } from "@/lib/db";
import { thanksTemplateReady } from "@/lib/notify/channels";
import { THANKS_PREFIX, orderNumberFromThanksName, thanksName } from "@/lib/thanks-coupon";

const PAID = ["AUTHORIZED", "CAPTURED"];

/** What the order page needs: may a thank-you go out, to whom, and has one. */
export async function thanksContext(orderNumber: string) {
  const order = await db.order.findUnique({
    where: { orderNumber },
    select: {
      id: true,
      status: true,
      guestName: true,
      guestPhone: true,
      whatsappOptIn: true,
      user: { select: { name: true, phone: true } },
      items: { select: { titleSnap: true } },
      notes: { where: { body: { startsWith: "נשלח קופון" } }, select: { body: true }, take: 1 },
      notifications: { where: { channel: "WHATSAPP", event: "THANK_COUPON", status: "SENT" }, select: { id: true }, take: 1 },
    },
  });
  if (!order || !["SHIPPED", "DELIVERED"].includes(order.status)) return null;
  const promo = await db.promotion.findFirst({ where: { name: thanksName(orderNumber) }, select: { code: true } });
  return {
    orderId: order.id,
    name: order.user?.name ?? order.guestName ?? null,
    phone: order.user?.phone ?? order.guestPhone ?? null,
    optIn: order.whatsappOptIn,
    titles: order.items.map((i) => i.titleSnap),
    existingCode: promo?.code ?? null,
    alreadySent: order.notes.length > 0,
    botSent: order.notifications.length > 0,
    botReady: thanksTemplateReady(),
  };
}

/** The list for the coupons screen: created, for whom, used or not. */
export async function getThanksCoupons() {
  const promos = await db.promotion.findMany({
    where: { code: { startsWith: THANKS_PREFIX } },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { code: true, name: true, createdAt: true, endsAt: true, isActive: true },
  });
  const codes = promos.map((p) => p.code!).filter(Boolean);
  const numbers = promos.map((p) => orderNumberFromThanksName(p.name)).filter((n): n is string => !!n);
  const [orders, used] = await Promise.all([
    db.order.findMany({
      where: { orderNumber: { in: numbers } },
      select: { orderNumber: true, guestName: true, user: { select: { name: true } } },
    }),
    codes.length
      ? db.order.groupBy({ by: ["couponCode"], where: { couponCode: { in: codes }, paymentStatus: { in: PAID } }, _count: { _all: true } })
      : Promise.resolve([]),
  ]);
  const who = new Map(orders.map((o) => [o.orderNumber, o.user?.name ?? o.guestName ?? "—"]));
  const usedSet = new Set(used.map((u) => u.couponCode));
  return promos.map((p) => {
    const orderNumber = orderNumberFromThanksName(p.name);
    return {
      code: p.code!,
      orderNumber,
      customer: (orderNumber && who.get(orderNumber)) || "—",
      createdAt: p.createdAt,
      endsAt: p.endsAt,
      used: usedSet.has(p.code!),
      expired: !!p.endsAt && p.endsAt < new Date(),
    };
  });
}
