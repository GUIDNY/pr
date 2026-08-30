import Link from "next/link";
import Image from "next/image";
import { Star } from "lucide-react";
import { ProductImagePlaceholder } from "@/components/product/product-image-placeholder";
import { PriceBlock } from "@/components/product/price-block";
import { StockBadge } from "@/components/product/stock-badge";
import { FavoriteButton } from "@/components/product/favorite-button";
import { AddToCartButton } from "@/components/product/add-to-cart-button";
import type { StockStatus } from "@/lib/enums";
import { cn } from "@/lib/utils";

export type ProductCardData = {
  id: string;
  slug: string;
  title: string;
  brandName: string;
  categoryIcon?: string | null;
  imageUrl?: string | null;
  price: number;
  compareAtPrice: number | null;
  installmentMonths: number | null;
  stockStatus: StockStatus;
  ratingAvg: number;
  ratingCount: number;
  deliveryDays: number;
};

export function ProductCard({
  product,
  isFavorite = false,
  className,
}: {
  product: ProductCardData;
  isFavorite?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "group border-border bg-card relative flex flex-col overflow-hidden rounded-xl border transition-shadow hover:shadow-lg",
        className
      )}
    >
      <Link href={`/product/${product.slug}`} className="bg-muted relative block aspect-square overflow-hidden">
        <div className="size-full transition-transform duration-300 group-hover:scale-105">
          {product.imageUrl ? (
            <Image
              src={product.imageUrl}
              alt={product.title}
              fill
              className="bg-white object-contain"
              sizes="(min-width: 1024px) 25vw, 50vw"
              // no-referrer: with images.unoptimized the browser fetches
              // these URLs directly, and most of them live on other Israeli
              // retailers' servers. Without this, every product view puts
              // pr-ayam.vercel.app in their access logs — which is how a
              // competitor notices the hotlinking and breaks or swaps the
              // image. It does not fix the underlying dependency; it removes
              // the signal that invites someone to act on it.
              referrerPolicy="no-referrer"
            />
          ) : (
            <ProductImagePlaceholder title={product.title} brand={product.brandName} icon={product.categoryIcon} />
          )}
        </div>
        {product.compareAtPrice && product.compareAtPrice > product.price && (
          <span className="bg-brand text-brand-foreground absolute top-2 start-2 rounded px-2 py-0.5 text-xs font-bold">
            מבצע
          </span>
        )}
        <FavoriteButton productId={product.id} initialFavorite={isFavorite} className="absolute top-2 end-2" />
      </Link>

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          {product.brandName}
        </span>
        <Link href={`/product/${product.slug}`} className="line-clamp-2 text-sm font-medium hover:underline">
          {product.title}
        </Link>

        {product.ratingCount > 0 && (
          <div className="flex items-center gap-1 text-xs">
            <Star className="fill-warning text-warning size-3.5" />
            <span className="font-medium">{product.ratingAvg.toFixed(1)}</span>
            <span className="text-muted-foreground">({product.ratingCount})</span>
          </div>
        )}

        <div className="mt-1 flex-1">
          <PriceBlock
            price={product.price}
            compareAtPrice={product.compareAtPrice}
            installmentMonths={product.installmentMonths}
            size="sm"
          />
        </div>

        <StockBadge status={product.stockStatus} />

        <AddToCartButton
          productId={product.id}
          disabled={product.stockStatus === "OUT_OF_STOCK"}
          size="sm"
          className="mt-1 w-full"
          label={product.stockStatus === "OUT_OF_STOCK" ? "אזל מהמלאי" : "הוספה לעגלה"}
        />
      </div>
    </div>
  );
}
