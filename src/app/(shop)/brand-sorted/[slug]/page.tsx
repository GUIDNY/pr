import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrandPageView } from "@/components/brand/brand-page-view";
import { getProductsByBrandSlug, type ProductSort } from "@/lib/queries/products";

// The same brand listing, for a request that actually chose a sort. Nobody
// links here: proxy.ts rewrites /brand/x?sort=price-asc to this route, so the
// address bar still reads /brand/x?sort=price-asc and the canonical below
// still points at the bare address. It exists so that reading search params —
// the thing that forces a route to be rendered per request — happens only on
// the requests that have any.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const { brand } = await getProductsByBrandSlug(slug);
  if (!brand) return {};
  return {
    title: brand.name,
    description: brand.description ?? undefined,
    // A sorted view is the same products in a different order, so the bare
    // brand address is the one Google should hold.
    alternates: { canonical: `/brand/${brand.slug}` },
  };
}

export default async function BrandSortedPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const sort = (typeof sp.sort === "string" ? sp.sort : "relevance") as ProductSort;

  // No legacy-slug lookup here: an old address never carries a sort, and the
  // config-level redirect catches it before this route is ever reached.
  const { brand } = await getProductsByBrandSlug(slug);
  if (!brand) notFound();

  return <BrandPageView slug={slug} sort={sort} />;
}
