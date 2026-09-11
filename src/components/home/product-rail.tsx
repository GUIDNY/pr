import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ProductCard, type ProductCardData } from "@/components/product/product-card";

export function ProductRail({
  title,
  subtitle,
  products,
  viewAllHref,
  viewAllLabel = "לכל המוצרים",
  favoriteIds = [],
}: {
  title: string;
  subtitle?: string;
  products: ProductCardData[];
  viewAllHref?: string;
  viewAllLabel?: string;
  favoriteIds?: string[];
}) {
  if (products.length === 0) return null;

  return (
    <section className="mx-auto max-w-7xl px-4 py-7">
      <div className="mb-5 flex items-end justify-between">
        <div>
          <h2 className="text-xl font-bold sm:text-2xl">{title}</h2>
          {subtitle && <p className="text-muted-foreground mt-1 text-sm">{subtitle}</p>}
        </div>
        {viewAllHref && (
          <Link href={viewAllHref} className="text-brand flex shrink-0 items-center gap-1 text-sm font-medium hover:underline">
            {viewAllLabel}
            <ArrowLeft className="size-3.5" />
          </Link>
        )}
      </div>
      {/* One row that scrolls sideways, snapping card by card: five
          across on a wide screen, a little over two on a phone so the cut
          card says there is more. The grid it replaces wrapped to a second
          row and turned every rail into a wall; a row keeps each
          department to one glance and the page to a scroll. */}
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:thin] sm:gap-4">
        {products.map((p) => (
          <ProductCard
            key={p.id}
            product={p}
            isFavorite={favoriteIds.includes(p.id)}
            className="w-[calc(50%-6px)] shrink-0 snap-start sm:w-[calc(33.333%-11px)] lg:w-[calc(25%-12px)] xl:w-[calc(20%-13px)]"
          />
        ))}
      </div>
    </section>
  );
}
