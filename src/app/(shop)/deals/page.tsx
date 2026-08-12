import { Tag } from "lucide-react";
import { ProductCard } from "@/components/product/product-card";
import { getDeals } from "@/lib/queries/products";
import { getFavoriteProductIdsAction } from "@/actions/favorites";

export const metadata = { title: "מבצעים" };

export default async function DealsPage() {
  const [products, favoriteIds] = await Promise.all([getDeals(48), getFavoriteProductIdsAction()]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <span className="bg-brand text-brand-foreground flex size-11 items-center justify-center rounded-full">
          <Tag className="size-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold">מבצעים</h1>
          <p className="text-muted-foreground text-sm">{products.length} מוצרים במבצע</p>
        </div>
      </div>

      {products.length === 0 ? (
        <p className="text-muted-foreground py-16 text-center">אין כרגע מוצרים במבצע.</p>
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
