"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { productSchema, type ProductInput } from "@/lib/product-schema";
import { uploadProductImage } from "@/lib/product-image-storage";
import { reconcileUrgentMissingMedia } from "@/lib/inventory/sync";
import { checkImageUrl } from "@/lib/integrations/product-enrich-shared";

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

// Lightweight, single-purpose actions for editing a product inline on its
// own public page — deliberately not routed through updateProductAction,
// since that requires the full ProductInput shape (brand, category, stock,
// warranty, ...) and re-validates all of it on every save, which is the
// wrong shape for "just fix this one field without re-submitting the rest."
export async function updateProductBasicAction(
  id: string,
  data: { title?: string; description?: string; price?: number }
) {
  const session = await requireAdmin();
  const update: Record<string, unknown> = {};
  if (data.title !== undefined) {
    const title = data.title.trim();
    if (!title) return { success: false, error: "שם המוצר לא יכול להיות ריק" };
    update.title = title;
  }
  if (data.description !== undefined) update.description = data.description.trim() || null;
  if (data.price !== undefined) {
    if (!Number.isFinite(data.price) || data.price <= 0) return { success: false, error: "מחיר לא תקין" };
    update.price = data.price;
  }
  if (Object.keys(update).length === 0) return { success: true, error: null };

  const product = await db.product.update({ where: { id }, data: update, select: { slug: true } });
  await logAudit({ actorId: session.sub, action: "PRODUCT_UPDATED", entityType: "Product", entityId: id, metadata: update });

  revalidatePath(`/product/${product.slug}`);
  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${id}`);
  return { success: true, error: null };
}

export async function addProductImageAction(productId: string, url: string) {
  const session = await requireAdmin();
  if (!url.startsWith("https://")) return { success: false, error: "כתובת תמונה לא תקינה" };

  // Same confirmed-dead-link check the external enrichment API already runs
  // — this was the one entry point that skipped it, so a manually pasted
  // 404 sat on a product forever with nothing catching it. Only a
  // *confirmed* 404/410 is rejected; a host that just blocks our server
  // (403/5xx — common bot protection) is let through rather than treating
  // "we couldn't check" as "it's broken".
  const status = await checkImageUrl(url);
  if (status === "confirmed-bad") return { success: false, error: "כתובת התמונה מחזירה 404 — הקישור לא תקין או שהתמונה הוסרה" };

  const [product, maxSort] = await Promise.all([
    db.product.findUniqueOrThrow({ where: { id: productId }, select: { slug: true } }),
    db.productImage.aggregate({ where: { productId }, _max: { sortOrder: true } }),
  ]);
  const image = await db.productImage.create({
    data: { productId, url, sortOrder: (maxSort._max.sortOrder ?? -1) + 1 },
  });
  await logAudit({ actorId: session.sub, action: "PRODUCT_IMAGE_ADDED", entityType: "Product", entityId: productId, metadata: { url } });
  await reconcileUrgentMissingMedia();

  revalidatePath(`/product/${product.slug}`);
  return { success: true, error: null, image };
}

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

// The drag-and-drop counterpart to addProductImageAction — same end
// result (a new ProductImage row), just sourced from an actual file the
// browser handed us instead of a URL the admin typed in. The file has to
// land somewhere with a real public URL first, since ProductImage.url is
// always a URL, never raw bytes.
export async function uploadProductImageAction(productId: string, formData: FormData) {
  const session = await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File)) return { success: false, error: "לא התקבל קובץ" };
  if (!file.type.startsWith("image/")) return { success: false, error: "הקובץ שנבחר אינו תמונה" };
  if (file.size > MAX_UPLOAD_BYTES) return { success: false, error: "התמונה גדולה מדי (מקסימום 8MB)" };

  const [product, maxSort] = await Promise.all([
    db.product.findUniqueOrThrow({ where: { id: productId }, select: { slug: true } }),
    db.productImage.aggregate({ where: { productId }, _max: { sortOrder: true } }),
  ]);

  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
  const path = `${productId}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}${ext}`;
  let url: string;
  try {
    url = await uploadProductImage(path, bytes, file.type);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "העלאת התמונה נכשלה" };
  }

  const image = await db.productImage.create({
    data: { productId, url, sortOrder: (maxSort._max.sortOrder ?? -1) + 1 },
  });
  await logAudit({ actorId: session.sub, action: "PRODUCT_IMAGE_ADDED", entityType: "Product", entityId: productId, metadata: { url, uploaded: true } });
  await reconcileUrgentMissingMedia();

  revalidatePath(`/product/${product.slug}`);
  return { success: true, error: null, image };
}

export async function removeProductImageAction(imageId: string) {
  const session = await requireAdmin();
  const image = await db.productImage.findUnique({
    where: { id: imageId },
    include: { product: { select: { slug: true } } },
  });
  if (!image) return { success: false, error: "התמונה לא נמצאה" };

  await db.productImage.delete({ where: { id: imageId } });
  await logAudit({
    actorId: session.sub,
    action: "PRODUCT_IMAGE_REMOVED",
    entityType: "Product",
    entityId: image.productId,
    metadata: { url: image.url },
  });
  // Removing the last photo can just as easily create the "missing both"
  // state as never having one in the first place — same rule, both
  // directions.
  await reconcileUrgentMissingMedia();

  revalidatePath(`/product/${image.product.slug}`);
  return { success: true, error: null };
}

// Empty value clears the spec instead of storing a blank string — an admin
// clearing a field they filled by mistake should end up back at "not set",
// not at a spec row that renders empty.
export async function upsertProductSpecAction(productId: string, attributeId: string, value: string) {
  const session = await requireAdmin();
  const trimmed = value.trim();
  const product = await db.product.findUniqueOrThrow({ where: { id: productId }, select: { slug: true } });

  if (!trimmed) {
    await db.productAttributeValue.deleteMany({ where: { productId, attributeId } });
  } else {
    await db.productAttributeValue.upsert({
      where: { productId_attributeId: { productId, attributeId } },
      update: { value: trimmed },
      create: { productId, attributeId, value: trimmed },
    });
  }
  await logAudit({
    actorId: session.sub,
    action: "PRODUCT_SPEC_UPDATED",
    entityType: "Product",
    entityId: productId,
    metadata: { attributeId, value: trimmed || null },
  });
  await reconcileUrgentMissingMedia();

  revalidatePath(`/product/${product.slug}`);
  return { success: true, error: null };
}

// Every card/listing across the site shows images[0] (orderBy sortOrder
// asc, take 1) as the product's photo — so "which image is primary" is
// entirely a matter of which one has the lowest sortOrder. Re-numbering the
// whole set from scratch (rather than just swapping two sortOrder values)
// keeps it correct even if past edits left gaps or duplicate sort values.
export async function setPrimaryProductImageAction(productId: string, imageId: string) {
  const session = await requireAdmin();
  const [product, images] = await Promise.all([
    db.product.findUniqueOrThrow({ where: { id: productId }, select: { slug: true } }),
    db.productImage.findMany({ where: { productId }, orderBy: { sortOrder: "asc" } }),
  ]);
  const target = images.find((i) => i.id === imageId);
  if (!target) return { success: false, error: "התמונה לא נמצאה" };

  const reordered = [target, ...images.filter((i) => i.id !== imageId)];
  await db.$transaction(reordered.map((img, i) => db.productImage.update({ where: { id: img.id }, data: { sortOrder: i } })));
  await logAudit({ actorId: session.sub, action: "PRODUCT_IMAGE_SET_PRIMARY", entityType: "Product", entityId: productId, metadata: { imageId } });

  revalidatePath(`/product/${product.slug}`);
  revalidatePath("/");
  revalidatePath("/search");
  return { success: true, error: null };
}

// Free-form fallback for spec fields this category has no defined
// CategoryAttribute for — same idea as extraSpecsRaw's existing use for
// enrichment imports, just editable by an admin directly instead of only
// arriving from an external source. Merges into the same JSON bag rather
// than a separate field, so both entry points feed one place.
export async function upsertRawSpecAction(productId: string, key: string, value: string) {
  const session = await requireAdmin();
  const trimmedKey = key.trim();
  if (!trimmedKey) return { success: false, error: "שם שדה לא יכול להיות ריק" };

  const product = await db.product.findUniqueOrThrow({ where: { id: productId }, select: { slug: true, extraSpecsRaw: true } });
  const current: Record<string, string> = product.extraSpecsRaw ? JSON.parse(product.extraSpecsRaw) : {};
  const trimmedValue = value.trim();
  if (!trimmedValue) delete current[trimmedKey];
  else current[trimmedKey] = trimmedValue;

  await db.product.update({ where: { id: productId }, data: { extraSpecsRaw: Object.keys(current).length > 0 ? JSON.stringify(current) : null } });
  await logAudit({
    actorId: session.sub,
    action: "PRODUCT_RAW_SPEC_UPDATED",
    entityType: "Product",
    entityId: productId,
    metadata: { key: trimmedKey, value: trimmedValue || null },
  });
  await reconcileUrgentMissingMedia();

  revalidatePath(`/product/${product.slug}`);
  return { success: true, error: null };
}

// Manual admin flagging, independent of reconcileUrgentMissingMedia's
// automatic image/spec check — this is a plain to-do marker (doesn't touch
// isPublished), for a product that needs a human look for some other
// reason. "NONE" clears whichever of the two manual alert types is open;
// switching between ATTENTION and URGENT resolves the old one first so a
// product only ever sits in one of the two lists at a time.
export async function setProductReviewFlagAction(productId: string, level: "NONE" | "ATTENTION" | "URGENT") {
  const session = await requireAdmin();
  const product = await db.product.findUniqueOrThrow({
    where: { id: productId },
    select: { slug: true, title: true, sku: true, sourceId: true },
  });

  await db.inventoryAlert.updateMany({
    where: { productId, type: { in: ["MANUAL_ATTENTION", "MANUAL_URGENT"] }, isResolved: false },
    data: { isResolved: true, resolvedAt: new Date() },
  });

  if (level !== "NONE") {
    const type = level === "URGENT" ? "MANUAL_URGENT" : "MANUAL_ATTENTION";
    await db.inventoryAlert.create({
      data: {
        type,
        severity: level === "URGENT" ? "CRITICAL" : "WARNING",
        productId,
        sourceId: product.sourceId,
        sourceSku: product.sku,
        message: `${product.title}: סומן ידנית ${level === "URGENT" ? "לטיפול דחוף" : "לטיפול"} על ידי מנהל`,
      },
    });
  }

  await logAudit({
    actorId: session.sub,
    action: "PRODUCT_REVIEW_FLAG_SET",
    entityType: "Product",
    entityId: productId,
    metadata: { level },
  });

  revalidatePath(`/product/${product.slug}`);
  revalidatePath("/admin/inventory/urgent");
  revalidatePath("/admin/inventory/urgent-critical");
  return { success: true, error: null };
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
