import { Heart } from "lucide-react";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { ProductCard } from "@/components/product/product-card";
import { mapProductToCard } from "@/lib/queries/products";

export const metadata = { title: "מועדפים" };

export default async function FavoritesPage() {
  const session = await getSession();
  if (!session) return null;

  const favorites = await db.favorite.findMany({
    where: { userId: session.sub },
    include: { product: { include: { brand: true, category: { include: { parent: true } } } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">מועדפים</h1>

      {favorites.length === 0 ? (
        <div className="border-border flex flex-col items-center gap-3 rounded-xl border p-12 text-center">
          <Heart className="text-muted-foreground/40 size-12" strokeWidth={1} />
          <p className="text-muted-foreground text-sm">עדיין לא שמרתם מוצרים במועדפים</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {favorites.map((f) => (
            <ProductCard key={f.id} product={mapProductToCard(f.product)} isFavorite />
          ))}
        </div>
      )}
    </div>
  );
}
