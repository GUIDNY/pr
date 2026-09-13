import Link from "next/link";
import Image from "next/image";
import { Star, Truck } from "lucide-react";
import { ProductImagePlaceholder } from "@/components/product/product-image-placeholder";
import { PriceBlock } from "@/components/product/price-block";
import { StockBadge } from "@/components/product/stock-badge";
import { FavoriteButton } from "@/components/product/favorite-button";
import { AddToCartButton } from "@/components/product/add-to-cart-button";
import type { StockStatus } from "@/lib/enums";
import { cn } from "@/lib/utils";
import { discountPercent } from "@/lib/format";

export type ProductCardData = {
  id: string;
  // The internal cuid identifies the row; the sku is what the product is
  // called everywhere outside this site — g:id in the Google feed, and
  // content_ids in the Meta pixel. Carried on the card so a listing can
  // report what it showed without a second query.
  sku: string;
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
  // "מלאי אחרון" is true of most of the catalogue — the sheet carries one to
  // three units of nearly everything, which is what the threshold flags —
  // and a warning that is on every card is read as a sales trick, not as
  // information. On the card it is simply in stock; the product page keeps
  // the precise status for whoever wants it.
  const cardStatus: StockStatus = product.stockStatus === "LOW_STOCK" ? "IN_STOCK" : product.stockStatus;
  const pct = discountPercent(product.price, product.compareAtPrice ?? undefined);

  return (
    <div
      className={cn(
        "group border-border/80 bg-card hover:border-brand/40 relative flex flex-col overflow-hidden rounded-2xl border transition-all hover:shadow-lg",
        className
      )}
    >
      <Link href={`/product/${product.slug}`} className="relative block aspect-square overflow-hidden bg-white">
        <div className="size-full transition-transform duration-300 group-hover:scale-105">
          {product.imageUrl ? (
            <Image
              src={product.imageUrl}
              // Empty on purpose. The title link beside the picture names
              // the product for a screen reader already, and most of these
              // URLs are hotlinks to other retailers' servers that can stop
              // answering at any moment — when one does, a browser paints
              // the alt text across the picture area, and a card wearing a
              // paragraph where its photo should be is worse than a blank.
              alt=""
              fill
              className="bg-white object-contain p-3"
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
        {pct && (
          <span className="bg-brand text-brand-foreground absolute top-2.5 start-2.5 rounded-md px-2 py-0.5 text-xs font-bold tabular-nums">
            {pct}%-
          </span>
        )}
        <FavoriteButton productId={product.id} initialFavorite={isFavorite} className="absolute top-2 end-2" />
      </Link>

      <div className="flex flex-1 flex-col gap-1 border-t p-3 sm:p-3.5">
        <span className="text-muted-foreground text-xs font-semibold">{product.brandName}</span>
        <Link href={`/product/${product.slug}`} className="line-clamp-2 min-h-10 text-sm font-medium leading-5 hover:underline">
          {product.title}
        </Link>

        {product.ratingCount > 0 && (
          <div className="flex items-center gap-1 text-xs">
            <Star className="fill-warning text-warning size-3.5" />
            <span className="font-medium">{product.ratingAvg.toFixed(1)}</span>
            <span className="text-muted-foreground">({product.ratingCount})</span>
          </div>
        )}

        <div className="mt-1.5">
          <PriceBlock
            price={product.price}
            compareAtPrice={product.compareAtPrice}
            installmentMonths={product.installmentMonths}
            size="md"
          />
        </div>

        <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <StockBadge status={cardStatus} />
          {cardStatus !== "OUT_OF_STOCK" && (
            <span className="hidden items-center gap-1 sm:flex">
              <Truck className="size-3.5" /> משלוח תוך {product.deliveryDays} ימים
            </span>
          )}
        </div>

        <AddToCartButton
          productId={product.id}
          disabled={product.stockStatus === "OUT_OF_STOCK"}
          size="sm"
          className="mt-2.5 h-9 w-full rounded-lg text-sm sm:mt-3"
          label={product.stockStatus === "OUT_OF_STOCK" ? "אזל מהמלאי" : "הוספה לעגלה"}
        />
      </div>
    </div>
  );
}
