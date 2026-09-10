import "server-only";
import { db } from "@/lib/db";
import { PUBLIC_PRODUCT_WHERE } from "@/lib/queries/products";

export async function getHomepageSection(key: string) {
  const row = await db.homepageSection.findUnique({ where: { key } });
  if (!row || !row.isActive) return null;
  return { ...row, payload: JSON.parse(row.payload) };
}

export async function getActiveBrands() {
  return db.brand.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
}

/**
 * The brands index, with the dead ends left out.
 *
 * /brands listed every active brand — all 166 of them — and twenty of those
 * have nothing on the site: a brand page that renders an empty grid, linked
 * from a page whose whole job is to send people into the catalog. The count
 * comes back with each one so the card can say how much is actually there,
 * which is the difference between a directory and a list of names.
 */
export async function getBrandsWithProducts() {
  const brands = await db.brand.findMany({
    where: { isActive: true },
    include: { _count: { select: { products: { where: PUBLIC_PRODUCT_WHERE } } } },
    orderBy: { name: "asc" },
  });
  return brands
    .filter((b) => b._count.products > 0)
    .map((b) => ({
      name: b.name,
      slug: b.slug,
      description: b.description,
      logoUrl: b.logoUrl,
      productCount: b._count.products,
    }));
}

/**
 * The brands worth putting on the front page.
 *
 * The filter used to be "has a logo file", which was a stand-in for
 * "curated": the imported brand list carries noise — "לא ידוע", stray SKU
 * fragments — and a logo on disk meant a person had looked at it. It worked,
 * and it cost the strip its best names. Only eleven brands have a logo, so a
 * shop whose second-largest brand is Sauter with 87 products on the site was
 * showing Bosch, Samsung, LG and eight others, with Sauter, Siemens, Miele,
 * AEG, Gorenje and SMEG all absent.
 *
 * A count of real, live products says the same thing more directly and stays
 * true on its own. Noise does not accumulate stock: a brand with ten
 * published, in-stock, photographed products is a brand, and no stray SKU
 * fragment has ever reached ten.
 *
 * logoUrl now comes back nullable, and the strip draws a wordmark for the
 * ones without a file. Deliberately a wordmark and not a lookalike — the
 * manufacturers' own logos are trademarks and are not something to
 * approximate; the honest version is the name, set in our own type.
 */
const FEATURED_BRAND_MIN_PRODUCTS = 10;

export async function getFeaturedBrands(take = 40) {
  const brands = await db.brand.findMany({
    where: { isActive: true },
    include: { _count: { select: { products: { where: PUBLIC_PRODUCT_WHERE } } } },
  });
  return brands
    .filter((b) => b._count.products >= FEATURED_BRAND_MIN_PRODUCTS)
    .sort((a, b) => b._count.products - a._count.products)
    .slice(0, take)
    .map((b) => ({ name: b.name, slug: b.slug, logoUrl: b.logoUrl }));
}

export async function getCmsPage(slug: string) {
  return db.cmsPage.findUnique({ where: { slug } });
}
