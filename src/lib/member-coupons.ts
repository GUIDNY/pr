import "server-only";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";

/**
 * Personal coupons of the mall's club (MemberCoupon + its Promotion): one
 * code, one account, one paid order. Issued only by the server, from facts
 * the server holds — check-in days, paid orders — never from anything the
 * game reports. retireGameCoupon (game-wheel.ts) switches a code off once
 * the order that used it is final.
 */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function newCode(): string {
  return "GAME-" + Array.from(randomBytes(6), (x) => CODE_ALPHABET[x % CODE_ALPHABET.length]).join("");
}

export type MemberCouponSpec = {
  userId: string;
  kind: string;
  orderId?: string;
  label: string;
  rule: string;
  type: "FIXED" | "PERCENTAGE";
  value: number;
  min?: number;
  max?: number;
  days: number;
};

export type IssuedCoupon = { code: string; label: string; rule: string; min: number; endsAt: string };

export async function issueMemberCoupon(spec: MemberCouponSpec): Promise<IssuedCoupon> {
  let code = newCode();
  for (let i = 0; i < 5 && (await db.promotion.findUnique({ where: { code } })); i++) code = newCode();
  const endsAt = new Date(Date.now() + spec.days * 86_400_000);
  await db.memberCoupon.create({ data: { code, userId: spec.userId, kind: spec.kind, orderId: spec.orderId ?? null } });
  await db.promotion.create({
    data: {
      name: `מועדון BuyToday · ${spec.label} · ${spec.rule}`,
      code,
      type: spec.type,
      value: spec.value,
      scope: "CART",
      minCartAmount: spec.min || null,
      maxDiscount: spec.max ?? null,
      startsAt: new Date(),
      endsAt,
      isActive: true,
    },
  });
  return { code, label: spec.label, rule: spec.rule, min: spec.min ?? 0, endsAt: endsAt.toISOString() };
}

/** The account's coupons that can still be used. */
export async function listMemberCoupons(userId: string) {
  const mine = await db.memberCoupon.findMany({ where: { userId }, select: { code: true, kind: true } });
  if (!mine.length) return [];
  const kinds = new Map(mine.map((m) => [m.code, m.kind]));
  const promos = await db.promotion.findMany({
    where: { code: { in: mine.map((m) => m.code) }, isActive: true, endsAt: { gt: new Date() } },
    select: { code: true, type: true, value: true, minCartAmount: true, endsAt: true },
    orderBy: { endsAt: "asc" },
  });
  return promos.map((p) => ({
    code: p.code!,
    kind: kinds.get(p.code!) ?? "",
    label: p.type === "PERCENTAGE" ? `${p.value}% הנחה` : kinds.get(p.code!) === "cashback" ? `₪${p.value} קאשבק` : `₪${p.value} הנחה`,
    min: p.minCartAmount ?? 0,
    endsAt: p.endsAt!.toISOString(),
  }));
}

export async function hasMemberCoupon(userId: string, kind: string) {
  return !!(await db.memberCoupon.findFirst({ where: { userId, kind }, select: { code: true } }));
}
