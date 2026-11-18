import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { PUBLIC_PRODUCT_WHERE } from "@/lib/queries/products";
import { absoluteUrl } from "@/lib/site-url";
import { GAME_ORIGIN } from "@/lib/game-profile";
import { MALL_STORES } from "@/lib/mall-stores";

/**
 * GET /api/game/stores — the products each store in the 3D mall shows,
 * live: name, image, price and the product URL, read from the catalogue on
 * every request rather than from a snapshot inside the game.
 *
 * Only products that pass PUBLIC_PRODUCT_WHERE are returned — the same rule
 * as the site — so the mall cannot show something the shop does not sell,
 * and a product that goes out of stock or off the price list drops out of
 * its store by itself.
 *
 * Not personal, so no credentials and a short shared cache (60 s at the CDN,
 * stale for five minutes while it refreshes). CORS names the game's origin.
 */
export const dynamic = "force-dynamic";

const HEADERS = {
  "Access-Control-Allow-Origin": GAME_ORIGIN,
  Vary: "Origin",
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
};

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { ...HEADERS, "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Max-Age": "600" },
  });
}

export async function GET() {
  const slugs = [...new Set(Object.values(MALL_STORES).flatMap((s) => s.slugs))];
  const products = await db.product.findMany({
    where: { ...PUBLIC_PRODUCT_WHERE, slug: { in: slugs } },
    select: {
      slug: true,
      sku: true,
      title: true,
      price: true,
      compareAtPrice: true,
      brand: { select: { name: true } },
      images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
    },
  });
  const bySlug = new Map(products.map((p) => [p.slug, p]));

  const stores = Object.entries(MALL_STORES).map(([key, store]) => ({
    key,
    label: store.label,
    products: store.slugs.flatMap((slug) => {
      const p = bySlug.get(slug);
      if (!p) return [];
      const image = p.images[0]?.url;
      return [
        {
          slug: p.slug,
          sku: p.sku,
          title: p.title,
          brand: p.brand?.name ?? null,
          price: p.price,
          compareAtPrice: p.compareAtPrice && p.compareAtPrice > p.price ? p.compareAtPrice : null,
          image: image ? (image.startsWith("/") ? absoluteUrl(image) : image) : null,
          url: absoluteUrl(`/product/${p.slug}`),
        },
      ];
    }),
  }));

  return NextResponse.json({ updatedAt: new Date().toISOString(), stores }, { headers: HEADERS });
}
