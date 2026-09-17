"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireBackOffice } from "@/lib/auth";
import { canManageCatalog } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

/**
 * The removal settings, editable without a deploy.
 *
 * The brief's reason for wanting this is exact: so that adding a category
 * next month does not mean a code change. What it edits is therefore the
 * table rather than a constant — which also means the seed script must never
 * overwrite what is set here, and it does not (see scripts/recycling-categories.ts).
 *
 * Catalogue permission, unlike the per-order removal actions. This is the
 * shop's own data and a wrong answer here is wrong on every future order,
 * where a wrong answer there is wrong on one.
 */

async function requireCatalogManager() {
  const session = await requireBackOffice();
  if (!canManageCatalog(session.role)) return null;
  return session;
}

export async function saveRecyclingGroupAction(input: {
  id?: string;
  key: string;
  label: string;
  oldLabel: string;
  isLargeAppliance: boolean;
  asksExceptional: boolean;
  exceptionalFee: number | null;
  isEnabled: boolean;
  sortOrder: number;
}) {
  const session = await requireCatalogManager();
  if (!session) return { success: false as const, error: "אין הרשאה" };

  const key = input.key.trim().toLowerCase();
  /* The key travels: it is snapshotted onto order lines and it is what the
     carrier is told. Letters, digits and underscores only, so it survives a
     CSV, a booking form and whatever integration comes later. */
  if (!/^[a-z][a-z0-9_]{1,40}$/.test(key)) {
    return { success: false as const, error: "מזהה באנגלית בלבד, אותיות קטנות וקו תחתון" };
  }
  if (!input.label.trim() || !input.oldLabel.trim()) {
    return { success: false as const, error: "יש למלא שם מוצר ושם המוצר הישן" };
  }
  if (input.exceptionalFee !== null && (!Number.isFinite(input.exceptionalFee) || input.exceptionalFee < 0 || input.exceptionalFee > 5000)) {
    return { success: false as const, error: "מחיר פינוי חריג לא תקין" };
  }

  const data = {
    key,
    label: input.label.trim(),
    oldLabel: input.oldLabel.trim(),
    isLargeAppliance: input.isLargeAppliance,
    asksExceptional: input.asksExceptional,
    exceptionalFee: input.exceptionalFee,
    isEnabled: input.isEnabled,
    sortOrder: input.sortOrder,
  };

  /* The key is unique and an existing row may not take another's. Checked
     rather than left to the constraint so the message names the problem. */
  const clash = await db.recyclingCategory.findUnique({ where: { key }, select: { id: true } });
  if (clash && clash.id !== input.id) {
    return { success: false as const, error: `המזהה ${key} כבר קיים` };
  }

  const saved = input.id
    ? await db.recyclingCategory.update({ where: { id: input.id }, data })
    : await db.recyclingCategory.create({ data: { id: `rc_${key}`, ...data } });

  await logAudit({
    actorId: session.sub,
    action: input.id ? "RECYCLING_GROUP_UPDATED" : "RECYCLING_GROUP_CREATED",
    entityType: "RecyclingCategory",
    entityId: saved.id,
    metadata: { key },
  });

  revalidatePath("/admin/recycling");
  return { success: true as const, error: null };
}

/** Which equipment group a whole catalogue category maps to. Null unmaps it,
    which silences the offer for every product under it — the safe direction,
    and the one an unclear category should be left in. */
export async function setCategoryRecyclingAction(categoryId: string, recyclingCategoryId: string | null) {
  const session = await requireCatalogManager();
  if (!session) return { success: false as const, error: "אין הרשאה" };

  const category = await db.category.findUnique({ where: { id: categoryId }, select: { slug: true } });
  if (!category) return { success: false as const, error: "קטגוריה לא נמצאה" };

  await db.category.update({ where: { id: categoryId }, data: { recyclingCategoryId } });
  await logAudit({
    actorId: session.sub,
    action: "CATEGORY_RECYCLING_SET",
    entityType: "Category",
    entityId: categoryId,
    metadata: { slug: category.slug, recyclingCategoryId },
  });

  revalidatePath("/admin/recycling");
  return { success: true as const, error: null };
}

/**
 * One product's own answer, which beats its category's.
 *
 * Three states rather than two: a group, an opt-out, and neither. Neither
 * means "whatever the category says", which is what most products should be;
 * an opt-out is a deliberate "this is not an appliance" for the accessory
 * filed under one. Collapsing the last two would make it impossible to say
 * "no, really, not this one" about a product in a mapped category.
 */
export async function setProductRecyclingAction(
  productId: string,
  value: { recyclingCategoryId: string | null; optOut: boolean },
) {
  const session = await requireCatalogManager();
  if (!session) return { success: false as const, error: "אין הרשאה" };

  const product = await db.product.findUnique({ where: { id: productId }, select: { sku: true } });
  if (!product) return { success: false as const, error: "מוצר לא נמצא" };

  await db.product.update({
    where: { id: productId },
    data: {
      // An opt-out with a group set would be a contradiction stored in the
      // database, and resolveRemovalGroup would honour the opt-out — so the
      // group is cleared rather than left to be read by somebody later as an
      // answer that applies.
      recyclingCategoryId: value.optOut ? null : value.recyclingCategoryId,
      recyclingOptOut: value.optOut,
    },
  });
  await logAudit({
    actorId: session.sub,
    action: "PRODUCT_RECYCLING_SET",
    entityType: "Product",
    entityId: productId,
    metadata: { sku: product.sku, ...value },
  });

  revalidatePath("/admin/recycling");
  return { success: true as const, error: null };
}
