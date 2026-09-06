import type { Metadata } from "next";
import { CategoryPageView } from "@/components/category/category-page-view";
import { findCategoryBySlug } from "@/lib/category-tree";

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
  return {
    title: name,
    description: `${name} - מגוון רחב במחירים הטובים ביותר, משלוח עד הבית ואחריות יבואן רשמי.`,
    alternates: { canonical: `/category/${slug}` },
  };
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <CategoryPageView slug={slug} sp={{}} />;
}
