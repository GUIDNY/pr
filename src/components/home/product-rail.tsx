import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ProductCard, type ProductCardData } from "@/components/product/product-card";

export function ProductRail({
  title,
  subtitle,
  products,
  viewAllHref,
  favoriteIds = [],
}: {
  title: string;
  subtitle?: string;
  products: ProductCardData[];
  viewAllHref?: string;
  favoriteIds?: string[];
}) {
  if (products.length === 0) return null;

  return (
    <section className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-5 flex items-end justify-between">
        <div>
          <h2 className="text-xl font-bold sm:text-2xl">{title}</h2>
          {subtitle && <p className="text-muted-foreground mt-1 text-sm">{subtitle}</p>}
        </div>
        {viewAllHref && (
          <Link href={viewAllHref} className="text-brand flex shrink-0 items-center gap-1 text-sm font-medium hover:underline">
            לכל המוצרים
            <ArrowLeft className="size-3.5" />
          </Link>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} isFavorite={favoriteIds.includes(p.id)} />
        ))}
      </div>
    </section>
  );
}
