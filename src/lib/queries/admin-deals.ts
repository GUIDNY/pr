import "server-only";
import { db } from "@/lib/db";

/**
 * Everything currently on sale, for the back office.
 *
 * Deliberately NOT filtered by PUBLIC_PRODUCT_WHERE. The storefront's rail
 * only shows a deal that is published, in stock and photographed — so a
 * product can carry a discount nobody can see, and that is precisely what
 * this screen exists to surface. `liveOnSite` says which side of that line
 * each row falls on, and `hiddenReason` says why, because "I put it on sale
 * and it is not on the deals page" is otherwise unanswerable from the admin.
 */
export type DealRow = {
  id: string;
  sku: string;
  slug: string;
  title: string;
  brandName: string;
  imageUrl: string | null;
  price: number;
  compareAtPrice: number;
  discountPercent: number;
  liveOnSite: boolean;
  hiddenReason: string | null;
};

export async function getDealRows(): Promise<DealRow[]> {
  const rows = await db.product.findMany({
    where: { compareAtPrice: { not: null } },
    select: {
      id: true,
      sku: true,
      slug: true,
      title: true,
      price: true,
      compareAtPrice: true,
      isPublished: true,
      stockQty: true,
      brand: { select: { name: true } },
      images: { take: 1, orderBy: { sortOrder: "asc" }, select: { url: true } },
      _count: { select: { images: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return rows.map((p) => {
    const compareAtPrice = p.compareAtPrice as number;
    // Every reason at once, not the first one — fixing the stock on a
    // product that also has no photograph does not put it on the site, and
    // being told so one round at a time is how that turns into three trips.
    const reasons: string[] = [];
    if (!p.isPublished) reasons.push("לא מפורסם");
    if (p.stockQty <= 0) reasons.push("אזל מהמלאי");
    if (p._count.images === 0) reasons.push("אין תמונה");

    return {
      id: p.id,
      sku: p.sku,
      slug: p.slug,
      title: p.title,
      brandName: p.brand.name,
      imageUrl: p.images[0]?.url ?? null,
      price: p.price,
      compareAtPrice,
      // Guard the division: a "sale" whose before-price is not higher is a
      // data error, and 0% is the honest way to show it rather than a
      // negative or an Infinity on screen.
      discountPercent:
        compareAtPrice > p.price ? Math.round(((compareAtPrice - p.price) / compareAtPrice) * 100) : 0,
      liveOnSite: reasons.length === 0,
      hiddenReason: reasons.length > 0 ? reasons.join(" · ") : null,
    };
  });
}
