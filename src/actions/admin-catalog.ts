"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function createPromotionAction(input: {
  name: string;
  code?: string;
  type: "PERCENTAGE" | "FIXED";
  value: number;
  scope: "CART" | "CATEGORY" | "BRAND" | "PRODUCT";
  minCartAmount?: number;
}) {
  const session = await requireAdmin();
  if (!input.name.trim() || !input.value) return { success: false, error: "יש למלא שם וערך הנחה" };

  const promo = await db.promotion.create({
    data: {
      name: input.name,
      code: input.code ? input.code.toUpperCase() : null,
      type: input.type,
      value: input.value,
      scope: input.scope,
      minCartAmount: input.minCartAmount,
      isActive: true,
    },
  });
  await logAudit({ actorId: session.sub, action: "PROMOTION_CREATED", entityType: "Promotion", entityId: promo.id });
  revalidatePath("/admin/promotions");
  return { success: true, error: null };
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
