import type { Metadata } from "next";
import { CategoryPageView } from "@/components/category/category-page-view";
import { findCategoryBySlug } from "@/lib/category-tree";
import { countLiveProductsInCategory } from "@/lib/queries/categories";

// The canonical category page: no filter, no sort, no page number — which is
// what a crawler asks for and what nearly every visitor lands on.
//
// It reads no search params, so Next can prerender it and a CDN can hold it.
// The moment a route awaits searchParams it is dynamic, and a dynamic route
// is served `private, no-store`: rendered in Sydney, cached nowhere, ~840ms
// to first byte on all 97 categories. Applying a filter changes the URL, and
// proxy.ts sends that to the dynamic twin at category-filtered/ — so the cost
// of filtering is paid by the people filtering, not by everyone.
//
// generateStaticParams is what makes the caching happen at all, and returning
// nothing from it is deliberate: without the export, a route with a [slug] is
// rendered on demand and never cached, whatever `revalidate` says. With it
// and an empty list, nothing is built ahead of time — a build does not walk
// 97 categories — and each page is cached the first time it is asked for.
export const revalidate = 300;
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const found = findCategoryBySlug(slug);
  if (!found) return {};
  const name = found.sub?.name ?? found.department.name;

  /* A category with nothing to show is not offered to an index.
     Six of them were: the mega menu already hides a sub-category with no
     live products, and the sitemap left out the ones with no products at
     all — but a category holding ten products that are every one of them
     unphotographed or out of stock passed both filters and reached Google
     as an ordinary indexable page with an empty grid on it.

     noindex rather than 410 or a redirect, and computed rather than
     listed, because the condition is temporary in both directions: these
     are real categories whose products are hidden for missing content, and
     the moment one gets a photograph the page has something on it and
     indexes itself again with no list for anyone to remember to edit.

     follow stays on — the page still carries the breadcrumb and the
     department's other categories, and there is no reason to stop a
     crawler walking back out of it. */
  const live = await countLiveProductsInCategory(slug);

  return {
    title: name,
    description: `${name} - מגוון רחב במחירים הטובים ביותר, משלוח עד הבית ואחריות יבואן רשמי.`,
    alternates: { canonical: `/category/${slug}` },
    ...(live === 0 ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <CategoryPageView slug={slug} sp={{}} />;
}
