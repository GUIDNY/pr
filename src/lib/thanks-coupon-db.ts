import "server-only";
import { randomInt } from "crypto";
import { db } from "@/lib/db";
import { newThanksCode, thanksName, THANKS_DAYS, THANKS_PERCENT } from "@/lib/thanks-coupon";

/** The order's thank-you coupon: the one that exists, or a new one if none
    does. Only ever called from an owner's click. */
export async function getOrCreateThanksCoupon(orderNumber: string) {
  const name = thanksName(orderNumber);
  const existing = await db.promotion.findFirst({ where: { name }, select: { code: true, endsAt: true } });
  if (existing?.code && existing.endsAt) return { code: existing.code, endsAt: existing.endsAt, created: false };

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
  return { code, endsAt, created: true };
}
