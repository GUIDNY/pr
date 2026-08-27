import "server-only";
import { db } from "@/lib/db";

export async function getHomepageSection(key: string) {
  const row = await db.homepageSection.findUnique({ where: { key } });
  if (!row || !row.isActive) return null;
  return { ...row, payload: JSON.parse(row.payload) };
}

export async function getActiveBrands() {
  return db.brand.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
}

// Only a handful of brands have a real logo on file (curated from the
// manufacturer's own site, not the raw import-extracted brand list, which
// is full of noise like "לא ידוע" or stray SKU fragments) — showing just
// those keeps the strip a recognizable, trustworthy set instead of the
// full messy brand list.
export async function getFeaturedBrands(take = 4) {
  const brands = await db.brand.findMany({
    where: { isActive: true, logoUrl: { not: null } },
    include: { _count: { select: { products: { where: { isPublished: true, stockQty: { gt: 0 } } } } } },
  });
  return brands
    .sort((a, b) => b._count.products - a._count.products)
    .slice(0, take)
    .map((b) => ({ name: b.name, slug: b.slug, logoUrl: b.logoUrl as string }));
}

export async function getCmsPage(slug: string) {
  return db.cmsPage.findUnique({ where: { slug } });
}
