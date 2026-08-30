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
import { getArticleByCategorySlug } from "@/lib/queries/articles";
import { findCategoryBySlug } from "@/lib/category-tree";
import { PackageSearch, BookOpen, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 24;
// "Everything on one page" is really just a much larger page. Keeping it as
// a page size rather than a separate no-limit path means the pagination
// below keeps working unchanged: on almost every category it collapses to a
// single page and disappears by itself, and on a department large enough to
// pass 500 products the rest is still reachable instead of silently missing.
//
// 500 rather than no cap at all because every card is a row of product data
// in the server payload — the photos are lazy, so what an unbounded list
// would actually cost is HTML, and a shopper who wants to scroll a whole
// category does not need the whole catalog in one response.
const ALL_PAGE_SIZE = 500;

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
  // Paged is the default: it is what the category pages have always done,
  // and it is the cheaper first paint.
  const showAll = sp.view === "all";
  const pageSize = showAll ? ALL_PAGE_SIZE : PAGE_SIZE;
  const brandSlugs = sp.brand ? (Array.isArray(sp.brand) ? sp.brand : [sp.brand]) : [];
  const minPrice = sp.min ? Number(sp.min) : undefined;
  const maxPrice = sp.max ? Number(sp.max) : undefined;

  const attributeFilters: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(sp)) {
    if (key.startsWith("attr_") && value) {
      attributeFilters[key.replace("attr_", "")] = Array.isArray(value) ? value : [value];
    }
  }

  const [{ products, total, category, brands, priceRange }, attributes, favoriteIds, guideArticle] = await Promise.all([
    getProductsByCategorySlug(slug, {
      sort,
      page,
      pageSize,
      brandSlugs,
      minPrice,
      maxPrice,
      attributeFilters,
    }),
    getCategoryFilterAttributes(slug),
    getFavoriteProductIdsAction(),
    getArticleByCategorySlug(slug),
  ]);

  if (!category) notFound();

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const filterAttrs = attributes.map((a) => ({
    key: a.key,
    label: a.label,
    unit: a.unit,
    options: a.options ? (JSON.parse(a.options) as string[]) : null,
  }));

  // Both helpers keep every other search param — the filters, the sort —
  // so switching view or page never silently clears a filter the shopper
  // set. Each drops only the one param it owns.
  function hrefWith(overrides: Record<string, string | null>) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(sp)) {
      if (key in overrides) continue;
      if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
      else if (value) params.set(key, value);
    }
    for (const [key, value] of Object.entries(overrides)) {
      if (value !== null) params.set(key, value);
    }
    const qs = params.toString();
    return `/category/${slug}${qs ? `?${qs}` : ""}`;
  }

  function pageHref(p: number) {
    return hrefWith({ page: p > 1 ? String(p) : null });
  }

  // Changing the view always returns to the first page: page 4 of 24-item
  // pages is not page 4 of 500-item pages, and landing on an empty page
  // after a toggle reads as "the category lost its products".
  function viewHref(v: "paged" | "all") {
    return hrefWith({ view: v === "all" ? "all" : null, page: null });
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
          {/* flex-wrap: on a 390px phone the count plus three controls —
              filters, view toggle, sort — do not fit on one line, and
              without wrapping the sort select is the one that gets crushed.
              The controls move under the count as a group instead. */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <p className="text-muted-foreground text-sm">{total} מוצרים</p>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <MobileFilters brands={brands} attributes={filterAttrs} priceRange={priceRange} resultCount={total} />
              {/* Two links, not a client-side toggle: the choice belongs in
                  the URL so it survives a reload, a back button and a
                  shared link, and the page is a Server Component that reads
                  it straight out of searchParams with no JS at all. Hidden
                  when everything already fits on one page, where the two
                  options render the same thing. */}
              {total > PAGE_SIZE && (
                <div className="border-border bg-card flex shrink-0 items-center rounded-lg border p-0.5 text-xs font-medium">
                  <Link
                    href={viewHref("paged")}
                    aria-current={showAll ? undefined : "true"}
                    className={cn(
                      "rounded-md px-2.5 py-1.5 transition-colors",
                      showAll ? "text-muted-foreground hover:text-foreground" : "bg-secondary text-foreground",
                    )}
                  >
                    <span className="sm:hidden">עמודים</span>
                    <span className="hidden sm:inline">לפי עמודים</span>
                  </Link>
                  <Link
                    href={viewHref("all")}
                    aria-current={showAll ? "true" : undefined}
                    className={cn(
                      "rounded-md px-2.5 py-1.5 transition-colors",
                      showAll ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span className="sm:hidden">הכל</span>
                    <span className="hidden sm:inline">הכל בעמוד אחד</span>
                  </Link>
                </div>
              )}
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

      {guideArticle && (
        <Link
          href={`/articles/${guideArticle.slug}`}
          className="border-border hover:border-brand/40 hover:shadow-md group mt-10 flex flex-col items-start gap-5 rounded-2xl border bg-gradient-to-l from-secondary/60 to-transparent p-5 transition-all sm:flex-row sm:items-center sm:p-6"
        >
          <span className="bg-brand/10 text-brand flex size-12 shrink-0 items-center justify-center rounded-xl">
            <BookOpen className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-brand text-xs font-semibold">מדריך קנייה</p>
            <p className="group-hover:text-brand mt-0.5 text-lg font-bold transition-colors">{guideArticle.title}</p>
            <p className="text-muted-foreground mt-1 line-clamp-2 text-sm leading-relaxed">{guideArticle.excerpt}</p>
          </div>
          <span className="bg-brand text-brand-foreground flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold">
            לקריאת המדריך
            <ArrowLeft className="size-4 rtl:rotate-180" />
          </span>
        </Link>
      )}
    </div>
  );
}
