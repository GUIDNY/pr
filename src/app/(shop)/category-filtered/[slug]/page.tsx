import type { Metadata } from "next";
import { CategoryPageView } from "@/components/category/category-page-view";
import { findCategoryBySlug } from "@/lib/category-tree";
import { listingCanonical } from "@/lib/site-url";

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
  return {
    title: name,
    description: `${name} - מגוון רחב במחירים הטובים ביותר, משלוח עד הבית ואחריות יבואן רשמי.`,
    // Page 2 is its own address; every other filtered view points back at the
    // bare category, which is the page Google should hold — see listingCanonical.
    alternates: { canonical: listingCanonical(`/category/${slug}`, Number(sp.page) || 1) },
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
