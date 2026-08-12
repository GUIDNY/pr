import { Search as SearchIcon } from "lucide-react";
import { ProductCard } from "@/components/product/product-card";
import { searchProducts } from "@/lib/queries/products";
import { getFavoriteProductIdsAction } from "@/actions/favorites";

export const metadata = { title: "תוצאות חיפוש" };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const [products, favoriteIds] = await Promise.all([searchProducts(q, 48), getFavoriteProductIdsAction()]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex items-center gap-2">
        <SearchIcon className="text-muted-foreground size-5" />
        <h1 className="text-xl font-bold">
          תוצאות חיפוש עבור &quot;{q}&quot; <span className="text-muted-foreground font-normal">({products.length})</span>
        </h1>
      </div>

      {products.length === 0 ? (
        <div className="text-muted-foreground py-16 text-center text-sm">
          לא נמצאו מוצרים התואמים את החיפוש. נסו מילות חיפוש אחרות או עיינו בקטגוריות שלנו.
        </div>
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
