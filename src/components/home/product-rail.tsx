import { SectionHeading } from "@/components/home/section-heading";
import { ProductCard, type ProductCardData } from "@/components/product/product-card";

export function ProductRail({
  title,
  subtitle,
  eyebrow,
  products,
  viewAllHref,
  favoriteIds = [],
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  products: ProductCardData[];
  viewAllHref?: string;
  favoriteIds?: string[];
}) {
  if (products.length === 0) return null;

  return (
    <section className="mx-auto max-w-7xl px-4 py-8">
      <SectionHeading eyebrow={eyebrow} title={title} subtitle={subtitle} href={viewAllHref} />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} isFavorite={favoriteIds.includes(p.id)} />
        ))}
      </div>
    </section>
  );
}
