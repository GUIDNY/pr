import "server-only";
import { db } from "@/lib/db";

/**
 * The coupon screen's data.
 *
 * Personal coupons the mall's club hands out (GAME-XXXXXX, one per account,
 * see lib/member-coupons.ts) are kept out of the list and shown as a count:
 * there can be hundreds, nobody edits them by hand, and a shop coupon lost
 * among them is a shop coupon nobody can find.
 *
 * Usage is counted from paid orders here, the same way resolveCoupon counts
 * it, so the number the owner sees is the number the limit is judged by.
 */
export type AdminPromotion = {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  type: string;
  value: number;
  scope: string;
  scopeRefId: string | null;
  scopeRefName: string | null;
  minCartAmount: number | null;
  maxDiscount: number | null;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  firstOrderOnly: boolean;
  used: number;
  createdAt: string;
};

export type PromotionOptions = {
  categories: { id: string; name: string; parentName: string | null }[];
  brands: { id: string; name: string }[];
};

const PAID = ["AUTHORIZED", "CAPTURED"];

export async function getAdminPromotions(): Promise<{ promotions: AdminPromotion[]; personalCount: number }> {
  const [rows, personalCount] = await Promise.all([
    db.promotion.findMany({
      where: { OR: [{ code: null }, { code: { not: { startsWith: "GAME-" } } }] },
      orderBy: { createdAt: "desc" },
    }),
    db.promotion.count({ where: { code: { startsWith: "GAME-" } } }),
  ]);

  const codes = rows.map((r) => r.code).filter((c): c is string => !!c);
  const usage = codes.length
    ? await db.order.groupBy({
        by: ["couponCode"],
        where: { couponCode: { in: codes }, paymentStatus: { in: PAID } },
        _count: { _all: true },
      })
    : [];
  const usedBy = new Map(usage.map((u) => [u.couponCode, u._count._all]));

  /* The thing a scoped coupon points at, by name, so the table does not
     show an id. One query per kind, not per row. */
  const categoryIds = rows.filter((r) => r.scope === "CATEGORY" && r.scopeRefId).map((r) => r.scopeRefId!);
  const brandIds = rows.filter((r) => r.scope === "BRAND" && r.scopeRefId).map((r) => r.scopeRefId!);
  const productIds = rows.filter((r) => r.scope === "PRODUCT" && r.scopeRefId).map((r) => r.scopeRefId!);
  const [categories, brands, products] = await Promise.all([
    categoryIds.length ? db.category.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name: true } }) : [],
    brandIds.length ? db.brand.findMany({ where: { id: { in: brandIds } }, select: { id: true, name: true } }) : [],
    productIds.length
      ? db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, title: true, sku: true } })
      : [],
  ]);
  const names = new Map<string, string>([
    ...categories.map((c) => [c.id, c.name] as const),
    ...brands.map((b) => [b.id, b.name] as const),
    ...products.map((p) => [p.id, `${p.title} (${p.sku})`] as const),
  ]);

  return {
    personalCount,
    promotions: rows.map((r) => ({
      id: r.id,
      name: r.name,
      code: r.code,
      description: r.description,
      type: r.type,
      value: r.value,
      scope: r.scope,
      scopeRefId: r.scopeRefId,
      scopeRefName: r.scopeRefId ? (names.get(r.scopeRefId) ?? null) : null,
      minCartAmount: r.minCartAmount,
      maxDiscount: r.maxDiscount,
      startsAt: r.startsAt?.toISOString() ?? null,
      endsAt: r.endsAt?.toISOString() ?? null,
      isActive: r.isActive,
      usageLimit: r.usageLimit,
      perCustomerLimit: r.perCustomerLimit,
      firstOrderOnly: r.firstOrderOnly,
      used: r.code ? (usedBy.get(r.code) ?? 0) : 0,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

/** The pickers' choices: every category (departments and leaves, labelled
    by their department) and every brand. Products are searched on demand. */
export async function getPromotionOptions(): Promise<PromotionOptions> {
  const [categories, brands] = await Promise.all([
    db.category.findMany({
      select: { id: true, name: true, parent: { select: { name: true } } },
      orderBy: [{ parentId: "asc" }, { name: "asc" }],
    }),
    db.brand.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return {
    categories: categories.map((c) => ({ id: c.id, name: c.name, parentName: c.parent?.name ?? null })),
    brands,
  };
}
