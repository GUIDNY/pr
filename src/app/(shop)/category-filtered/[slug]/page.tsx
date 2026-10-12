import type { Metadata } from "next";
import { CategoryPageView } from "@/components/category/category-page-view";
import { findCategoryBySlug } from "@/lib/category-tree";
import { listingCanonical } from "@/lib/site-url";
import { getCategoryMetaFacts } from "@/lib/queries/categories";
import { categoryMetaDescription, categoryPageTitle } from "@/lib/seo/category-description";
import { LISTING_MIN_PRODUCTS } from "@/lib/queries/products";

// The same category listing, for a request that actually carries a filter,
// a sort or a page number. Nobody links here: proxy.ts rewrites
// /category/tvs?brand=lg to this route, so the address bar still reads
// /category/tvs?brand=lg and the canonical below still points at the real
// address. It exists so that reading search params — which is what forces a
// route to be rendered per request — happens only on the requests that have
// any.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const { slug } = await params;
  const sp = await searchParams;
  const found = findCategoryBySlug(slug);
  if (!found) return {};
  const name = found.sub?.name ?? found.department.name;
  const page = Number(sp.page) || 1;
  const facts = await getCategoryMetaFacts(slug);
  /* Page 2 of a shelf is its own page to a crawler — self-canonical, its
     own title, its own description — and never a copy of page 1. Folding
     the pages into page 1 (a canonical back to it, or noindex) would hide
     every product past the first thirty from a crawler that walks links,
     which is exactly how 297 products came to have no inbound link. The
     same noindex-under-threshold rule as page 1. */
  return {
    title: categoryPageTitle(name, page),
    description: categoryMetaDescription(name, facts, page),
    // Page 2 is its own address; every other filtered view points back at the
    // bare category, which is the page Google should hold — see listingCanonical.
    alternates: { canonical: listingCanonical(`/category/${slug}`, page) },
    ...(facts.count < LISTING_MIN_PRODUCTS ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function CategoryFilteredPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  return <CategoryPageView slug={slug} sp={sp} />;
}
