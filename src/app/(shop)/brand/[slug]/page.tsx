import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ProductCard } from "@/components/product/product-card";
import { SortSelect } from "@/components/catalog/sort-select";
import { getProductsByBrandSlug, type ProductSort } from "@/lib/queries/products";
import { getFavoriteProductIdsAction } from "@/actions/favorites";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const { brand } = await getProductsByBrandSlug(slug);
  if (!brand) return {};
  return { title: brand.name, description: brand.description ?? undefined };
}

export default async function BrandPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const sort = (typeof sp.sort === "string" ? sp.sort : "relevance") as ProductSort;

  const [{ products, total, brand }, favoriteIds] = await Promise.all([
    getProductsByBrandSlug(slug, { sort, pageSize: 48 }),
    getFavoriteProductIdsAction(),
  ]);

  if (!brand) notFound();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b pb-6">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">{brand.name}</h1>
          {brand.description && <p className="text-muted-foreground mt-2 max-w-2xl text-sm">{brand.description}</p>}
          <p className="text-muted-foreground mt-2 text-sm">{total} מוצרים</p>
        </div>
        <SortSelect />
      </div>

      {products.length === 0 ? (
        <p className="text-muted-foreground py-16 text-center">אין כרגע מוצרים של מותג זה.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} isFavorite={favoriteIds.includes(p.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
