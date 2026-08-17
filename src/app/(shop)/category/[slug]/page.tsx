import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Pagination, PaginationContent, PaginationItem, PaginationLink } from "@/components/ui/pagination";
import { FilterSidebar } from "@/components/catalog/filter-sidebar";
import { MobileFilters } from "@/components/catalog/mobile-filters";
import { SortSelect } from "@/components/catalog/sort-select";
import { ProductCard } from "@/components/product/product-card";
import { getProductsByCategorySlug, getCategoryFilterAttributes, type ProductSort } from "@/lib/queries/products";
import { getFavoriteProductIdsAction } from "@/actions/favorites";
import { findCategoryBySlug } from "@/lib/category-tree";
import { PackageSearch } from "lucide-react";

const PAGE_SIZE = 24;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const found = findCategoryBySlug(slug);
  if (!found) return {};
  const name = found.sub?.name ?? found.department.name;
  return { title: name, description: `${name} - מגוון רחב במחירים הטובים ביותר, משלוח עד הבית ואחריות יבואן רשמי.` };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;

  const found = findCategoryBySlug(slug);
  if (!found) notFound();

  const sort = (typeof sp.sort === "string" ? sp.sort : "relevance") as ProductSort;
  const page = Number(sp.page) || 1;
  const brandSlugs = sp.brand ? (Array.isArray(sp.brand) ? sp.brand : [sp.brand]) : [];
  const minPrice = sp.min ? Number(sp.min) : undefined;
  const maxPrice = sp.max ? Number(sp.max) : undefined;

  const attributeFilters: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(sp)) {
    if (key.startsWith("attr_") && value) {
      attributeFilters[key.replace("attr_", "")] = Array.isArray(value) ? value : [value];
    }
  }

  const [{ products, total, category, brands, priceRange }, attributes, favoriteIds] = await Promise.all([
    getProductsByCategorySlug(slug, {
      sort,
      page,
      pageSize: PAGE_SIZE,
      brandSlugs,
      minPrice,
      maxPrice,
      attributeFilters,
    }),
    getCategoryFilterAttributes(slug),
    getFavoriteProductIdsAction(),
  ]);

  if (!category) notFound();

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filterAttrs = attributes.map((a) => ({
    key: a.key,
    label: a.label,
    unit: a.unit,
    options: a.options ? (JSON.parse(a.options) as string[]) : null,
  }));

  function pageHref(p: number) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(sp)) {
      if (key === "page") continue;
      if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
      else if (value) params.set(key, value);
    }
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return `/category/${slug}${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">ראשי</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          {found.sub && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href={`/category/${found.department.slug}`}>{found.department.name}</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
            </>
          )}
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{category.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <h1 className="mt-3 text-2xl font-bold sm:text-3xl">{category.name}</h1>
      {category.description && <p className="text-muted-foreground mt-2 max-w-2xl text-sm">{category.description}</p>}

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[240px_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <FilterSidebar brands={brands} attributes={filterAttrs} priceRange={priceRange} />
          </div>
        </aside>

        <div>
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">{total} מוצרים</p>
            <div className="flex items-center gap-2">
              <MobileFilters brands={brands} attributes={filterAttrs} priceRange={priceRange} resultCount={total} />
              <SortSelect />
            </div>
          </div>

          {products.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-20 text-center">
              <PackageSearch className="text-muted-foreground/40 size-16" strokeWidth={1} />
              <p className="font-medium">לא נמצאו מוצרים התואמים את הסינון</p>
              <Link href={`/category/${slug}`} className="text-brand text-sm hover:underline">
                נקה את כל המסננים
              </Link>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
                {products.map((p) => (
                  <ProductCard key={p.id} product={p} isFavorite={favoriteIds.includes(p.id)} />
                ))}
              </div>

              {totalPages > 1 && (
                <Pagination className="mt-8">
                  <PaginationContent>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                      <PaginationItem key={p}>
                        <PaginationLink href={pageHref(p)} isActive={p === page}>
                          {p}
                        </PaginationLink>
                      </PaginationItem>
                    ))}
                  </PaginationContent>
                </Pagination>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
