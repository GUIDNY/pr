import { notFound, permanentRedirect } from "next/navigation";
import { ProductCard } from "@/components/product/product-card";
import { SortSelect } from "@/components/catalog/sort-select";
import {
  getProductsByBrandSlug,
  getCurrentSlugForLegacyBrandSlug,
  type ProductSort,
} from "@/lib/queries/products";
import { normalizeDescription } from "@/lib/product-content";

/**
 * A brand listing, sorted however `sort` says.
 *
 * Split out of the route for the same reason CategoryPageView was: awaiting
 * searchParams is what makes a route dynamic, and a dynamic route is served
 * `private, no-store` and cached nowhere. There are 147 brand pages and the
 * bare address is what a crawler and nearly every visitor asks for, so that
 * address does not have to pay for a sort nobody chose. See
 * brand/[slug]/page.tsx (cached) and brand-sorted/[slug]/page.tsx (dynamic,
 * reached through proxy.ts only when ?sort= is actually present).
 */
export async function BrandPageView({
  slug,
  sort = "relevance",
}: {
  slug: string;
  sort?: ProductSort;
}) {
  const [{ products, total, brand }] = await Promise.all([
    getProductsByBrandSlug(slug, { sort, pageSize: 48 }),
  ]);

  // A renamed brand keeps answering at the address it was linked from —
  // see lib/legacy-slug-redirects.ts for why the same rules also live in
  // next.config, and what happens when they only live here.
  if (!brand) {
    const current = await getCurrentSlugForLegacyBrandSlug(slug);
    if (current) permanentRedirect(`/brand/${current}`);
    notFound();
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b pb-6">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">{brand.name}</h1>
          {/* Through normalizeDescription for the same reason the category
              page is: this text is written by the enrichment agent, which
              writes HTML about half the time, and a plain text node would
              print the tags. None of the 51 brand descriptions is HTML
              today — this is here so the next one that is does not become a
              second bug report. */}
          {normalizeDescription(brand.description) && (
            <p className="text-muted-foreground mt-2 max-w-2xl text-sm">{normalizeDescription(brand.description)}</p>
          )}
          <p className="text-muted-foreground mt-2 text-sm">{total} מוצרים</p>
        </div>
        <SortSelect query={sort === "relevance" ? "" : `sort=${sort}`} />
      </div>

      {products.length === 0 ? (
        <p className="text-muted-foreground py-16 text-center">אין כרגע מוצרים של מותג זה.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}
