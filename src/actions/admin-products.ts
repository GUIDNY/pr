"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { productSchema, type ProductInput } from "@/lib/product-schema";

export async function createProductAction(input: ProductInput) {
  const session = await requireAdmin();
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

  const existingSku = await db.product.findUnique({ where: { sku: parsed.data.sku } });
  if (existingSku) return { success: false, error: "מק\"ט זה כבר קיים במערכת" };
  const existingSlug = await db.product.findUnique({ where: { slug: parsed.data.slug } });
  if (existingSlug) return { success: false, error: "slug זה כבר קיים במערכת" };

  const product = await db.product.create({ data: parsed.data });
  await logAudit({ actorId: session.sub, action: "PRODUCT_CREATED", entityType: "Product", entityId: product.id });

  revalidatePath("/admin/products");
  redirect(`/admin/products/${product.id}`);
}

export async function updateProductAction(id: string, input: ProductInput) {
  const session = await requireAdmin();
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

  const clashSku = await db.product.findFirst({ where: { sku: parsed.data.sku, NOT: { id } } });
  if (clashSku) return { success: false, error: "מק\"ט זה כבר קיים במערכת" };
  const clashSlug = await db.product.findFirst({ where: { slug: parsed.data.slug, NOT: { id } } });
  if (clashSlug) return { success: false, error: "slug זה כבר קיים במערכת" };

  await db.product.update({ where: { id }, data: parsed.data });
  await logAudit({ actorId: session.sub, action: "PRODUCT_UPDATED", entityType: "Product", entityId: id });

  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${id}`);
  return { success: true, error: null };
}

export async function togglePublishAction(id: string, isPublished: boolean) {
  const session = await requireAdmin();
  await db.product.update({ where: { id }, data: { isPublished } });
  await logAudit({
    actorId: session.sub,
    action: isPublished ? "PRODUCT_PUBLISHED" : "PRODUCT_UNPUBLISHED",
    entityType: "Product",
    entityId: id,
  });
  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${id}`);
  return { success: true };
}

export async function duplicateProductAction(id: string) {
  const session = await requireAdmin();
  const original = await db.product.findUniqueOrThrow({ where: { id } });

  const copy = await db.product.create({
    data: {
      ...original,
      id: undefined,
      sku: `${original.sku}-COPY-${Date.now().toString().slice(-5)}`,
      slug: `${original.slug}-copy-${Date.now().toString().slice(-5)}`,
      title: `${original.title} (עותק)`,
      isPublished: false,
      ratingAvg: 0,
      ratingCount: 0,
      createdAt: undefined,
      updatedAt: undefined,
    },
  });
  await logAudit({ actorId: session.sub, action: "PRODUCT_DUPLICATED", entityType: "Product", entityId: copy.id, metadata: { from: id } });

  revalidatePath("/admin/products");
  redirect(`/admin/products/${copy.id}`);
}
