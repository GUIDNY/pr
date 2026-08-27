"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { checkImageUrl } from "@/lib/integrations/product-enrich-shared";

export async function updateBrandAboutAction(brandId: string, aboutContent: string) {
  const session = await requireAdmin();
  const trimmed = aboutContent.trim();

  const brand = await db.brand.update({
    where: { id: brandId },
    data: { aboutContent: trimmed || null },
    select: { slug: true },
  });

  await logAudit({ actorId: session.sub, action: "BRAND_ABOUT_UPDATED", entityType: "Brand", entityId: brandId });
  revalidatePath(`/brand/${brand.slug}`);
  return { success: true, error: null };
}

export async function addBrandImageAction(brandId: string, url: string) {
  const session = await requireAdmin();
  if (!url.startsWith("https://")) return { success: false, error: "כתובת תמונה לא תקינה" };

  const status = await checkImageUrl(url);
  if (status === "confirmed-bad") return { success: false, error: "כתובת התמונה מחזירה 404 — הקישור לא תקין או שהתמונה הוסרה" };

  const [brand, maxSort] = await Promise.all([
    db.brand.findUniqueOrThrow({ where: { id: brandId }, select: { slug: true } }),
    db.brandImage.aggregate({ where: { brandId }, _max: { sortOrder: true } }),
  ]);
  const image = await db.brandImage.create({
    data: { brandId, url, sortOrder: (maxSort._max.sortOrder ?? -1) + 1 },
  });
  await logAudit({ actorId: session.sub, action: "BRAND_IMAGE_ADDED", entityType: "Brand", entityId: brandId, metadata: { url } });

  revalidatePath(`/brand/${brand.slug}`);
  return { success: true, error: null, image };
}

export async function removeBrandImageAction(imageId: string) {
  const session = await requireAdmin();
  const image = await db.brandImage.findUnique({
    where: { id: imageId },
    include: { brand: { select: { slug: true } } },
  });
  if (!image) return { success: false, error: "התמונה לא נמצאה" };

  await db.brandImage.delete({ where: { id: imageId } });
  await logAudit({
    actorId: session.sub,
    action: "BRAND_IMAGE_REMOVED",
    entityType: "Brand",
    entityId: image.brandId,
    metadata: { url: image.url },
  });

  revalidatePath(`/brand/${image.brand.slug}`);
  return { success: true, error: null };
}
