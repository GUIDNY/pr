import "server-only";
import { db } from "@/lib/db";
import { PUBLIC_PRODUCT_WHERE } from "@/lib/queries/products";
import { isPlaceholderBrand } from "@/lib/brand-display";

export async function getHomepageSection(key: string) {
  const row = await db.homepageSection.findUnique({ where: { key } });
  if (!row || !row.isActive) return null;
  return { ...row, payload: JSON.parse(row.payload) };
}

export async function getActiveBrands() {
  const brands = await db.brand.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
  // The "unknown" placeholder is a real Brand row (products have to point
  // somewhere), but listing it on /brands puts "לא ידוע" on the shelf next
  // to Samsung and Bosch as though it were one of them.
  return brands.filter((b) => !isPlaceholderBrand(b.name));
}

// Only a handful of brands have a real logo on file (curated from the
// manufacturer's own site, not the raw import-extracted brand list, which
// is full of noise like "לא ידוע" or stray SKU fragments) — showing just
// those keeps the strip a recognizable, trustworthy set instead of the
// full messy brand list.
export async function getFeaturedBrands(take = 4) {
  const brands = await db.brand.findMany({
    where: { isActive: true, logoUrl: { not: null } },
    include: { _count: { select: { products: { where: PUBLIC_PRODUCT_WHERE } } } },
  });
  return brands
    .sort((a, b) => b._count.products - a._count.products)
    .slice(0, take)
    .map((b) => ({ name: b.name, slug: b.slug, logoUrl: b.logoUrl as string }));
}

export async function getCmsPage(slug: string) {
  return db.cmsPage.findUnique({ where: { slug } });
}
