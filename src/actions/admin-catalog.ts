"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { PROMOTION_SCOPES, PROMOTION_TYPES } from "@/lib/enums";

/**
 * A coupon as the owner's form sends it. Validated here, not trusted from
 * the screen: a code is what a customer types, so it is normalised to the
 * form resolveCoupon looks it up by (upper case, no spaces).
 */
const promotionSchema = z
  .object({
    name: z.string().trim().min(2, "יש להזין שם"),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{3,30}$/, "קוד: 3–30 תווים, אותיות באנגלית, ספרות או מקף")
      .optional()
      .or(z.literal("")),
    description: z.string().trim().max(120, "עד 120 תווים").optional().or(z.literal("")),
    type: z.enum(PROMOTION_TYPES),
    value: z.coerce.number().min(0),
    scope: z.enum(PROMOTION_SCOPES),
    scopeRefId: z.string().trim().optional().or(z.literal("")),
    minCartAmount: z.coerce.number().min(0).optional().nullable(),
    maxDiscount: z.coerce.number().min(0).optional().nullable(),
    startsAt: z.string().optional().nullable(),
    endsAt: z.string().optional().nullable(),
    usageLimit: z.coerce.number().int().min(1).optional().nullable(),
    perCustomerLimit: z.coerce.number().int().min(1).optional().nullable(),
    firstOrderOnly: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((d) => d.type === "FREE_DELIVERY" || d.value > 0, { message: "יש להזין ערך הנחה", path: ["value"] })
  .refine((d) => d.type !== "PERCENTAGE" || d.value <= 100, { message: "אחוז הנחה עד 100", path: ["value"] })
  .refine((d) => d.scope === "CART" || !!d.scopeRefId, { message: "יש לבחור על מה הקופון חל", path: ["scopeRefId"] })
  .refine(
    (d) => !d.startsAt || !d.endsAt || new Date(d.startsAt) <= new Date(d.endsAt),
    { message: "תאריך הסיום לפני ההתחלה", path: ["endsAt"] },
  );

export type PromotionInput = z.input<typeof promotionSchema>;

function promotionData(d: z.output<typeof promotionSchema>) {
  return {
    name: d.name,
    code: d.code ? d.code : null,
    description: d.description ? d.description : null,
    type: d.type,
    value: d.type === "FREE_DELIVERY" ? 0 : d.value,
    scope: d.scope,
    scopeRefId: d.scope === "CART" ? null : d.scopeRefId || null,
    minCartAmount: d.minCartAmount || null,
    maxDiscount: d.type === "PERCENTAGE" && d.maxDiscount ? d.maxDiscount : null,
    startsAt: d.startsAt ? new Date(d.startsAt) : null,
    endsAt: d.endsAt ? new Date(d.endsAt) : null,
    usageLimit: d.usageLimit || null,
    perCustomerLimit: d.perCustomerLimit || null,
    firstOrderOnly: d.firstOrderOnly === true,
    isActive: d.isActive !== false,
  };
}

async function codeTaken(code: string | null, exceptId?: string) {
  if (!code) return false;
  const other = await db.promotion.findUnique({ where: { code }, select: { id: true } });
  return !!other && other.id !== exceptId;
}

export async function createPromotionAction(input: PromotionInput) {
  const session = await requireAdmin();
  const parsed = promotionSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: parsed.error.issues[0]?.message ?? "שגיאה בטופס" };
  const data = promotionData(parsed.data);
  if (await codeTaken(data.code)) return { success: false as const, error: "הקוד הזה כבר קיים" };

  const promo = await db.promotion.create({ data });
  await logAudit({ actorId: session.sub, action: "PROMOTION_CREATED", entityType: "Promotion", entityId: promo.id });
  revalidatePath("/admin/promotions");
  return { success: true as const, error: null, id: promo.id };
}

export async function updatePromotionAction(id: string, input: PromotionInput) {
  const session = await requireAdmin();
  const parsed = promotionSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: parsed.error.issues[0]?.message ?? "שגיאה בטופס" };
  const data = promotionData(parsed.data);
  if (await codeTaken(data.code, id)) return { success: false as const, error: "הקוד הזה כבר קיים" };

  await db.promotion.update({ where: { id }, data });
  await logAudit({ actorId: session.sub, action: "PROMOTION_UPDATED", entityType: "Promotion", entityId: id });
  revalidatePath("/admin/promotions");
  return { success: true as const, error: null };
}

/** The product picker's search: title or SKU, a handful of matches. */
export async function searchProductsForPromotionAction(query: string) {
  await requireAdmin();
  const q = query.trim();
  if (q.length < 2) return [];
  const rows = await db.product.findMany({
    where: { OR: [{ title: { contains: q, mode: "insensitive" } }, { sku: { contains: q, mode: "insensitive" } }] },
    select: { id: true, title: true, sku: true, price: true },
    orderBy: { title: "asc" },
    take: 10,
  });
  return rows;
}

export async function togglePromotionAction(id: string, isActive: boolean) {
  const session = await requireAdmin();
  await db.promotion.update({ where: { id }, data: { isActive } });
  await logAudit({ actorId: session.sub, action: isActive ? "PROMOTION_ACTIVATED" : "PROMOTION_DEACTIVATED", entityType: "Promotion", entityId: id });
  revalidatePath("/admin/promotions");
  return { success: true };
}

export async function deletePromotionAction(id: string) {
  const session = await requireAdmin();
  await db.promotion.delete({ where: { id } });
  await logAudit({ actorId: session.sub, action: "PROMOTION_DELETED", entityType: "Promotion", entityId: id });
  revalidatePath("/admin/promotions");
  return { success: true };
}

export async function createSupplierAction(input: {
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  leadTimeDays: number;
}) {
  const session = await requireAdmin();
  if (!input.name.trim()) return { success: false, error: "יש להזין שם ספק" };

  const supplier = await db.supplier.create({ data: { ...input, isActive: true } });
  await logAudit({ actorId: session.sub, action: "SUPPLIER_CREATED", entityType: "Supplier", entityId: supplier.id });
  revalidatePath("/admin/suppliers");
  return { success: true, error: null };
}

export async function toggleSupplierActiveAction(id: string, isActive: boolean) {
  const session = await requireAdmin();
  await db.supplier.update({ where: { id }, data: { isActive } });
  await logAudit({ actorId: session.sub, action: isActive ? "SUPPLIER_ACTIVATED" : "SUPPLIER_DEACTIVATED", entityType: "Supplier", entityId: id });
  revalidatePath("/admin/suppliers");
  return { success: true };
}
