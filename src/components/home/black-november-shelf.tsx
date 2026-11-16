"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { ProductCardData } from "@/components/product/product-card";
import { FavoriteButton } from "@/components/product/favorite-button";
import { AddToCartButton } from "@/components/product/add-to-cart-button";
import {
  BLACK_NOVEMBER_LABEL,
  BLACK_NOVEMBER_LIMITED,
  TV_SIZE_BUCKETS,
  televisionFacts,
  tvSizeBucket,
  type TvSizeBucketKey,
} from "@/lib/campaigns/black-november";
import { formatInstallment, formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The shelf under the "בלאק נובמבר" strip: the size chips and the cards.
 *
 * Arranged the way a shop arranges televisions — by size. Fifteen sets from
 * one manufacturer share almost the same photograph, so a row of them told a
 * customer nothing; what tells them apart is the number of inches and the
 * kind of panel, and those now lead each card. The chips filter the row to
 * one size.
 *
 * A client component only because of the filter. Every card is in the
 * server's HTML and the row keeps its height when filtered, so nothing
 * arrives late and nothing below it moves.
 */
export function BlackNovemberShelf({
  products,
  layout,
}: {
  products: ProductCardData[];
  layout: "rail" | "grid";
}) {
  const items = useMemo(
    () =>
      products
        .map((product) => {
          const facts = televisionFacts(product.title);
          return { product, ...facts, bucket: tvSizeBucket(facts.inches) };
        })
        /* Smallest first, cheapest first within a size; a product whose title
           states no size goes last rather than being placed by a guess. */
        .sort((a, b) => (a.inches ?? 999) - (b.inches ?? 999) || a.product.price - b.product.price),
    [products],
  );

  /* Only the sizes that are actually on the shelf. */
  const chips = TV_SIZE_BUCKETS.filter((b) => items.some((i) => i.bucket === b.key));
  const [size, setSize] = useState<TvSizeBucketKey | null>(null);
  const shown = size ? items.filter((i) => i.bucket === size) : items;

  return (
    <>
      {chips.length > 1 && (
        <div
          role="group"
          aria-label="סינון לפי גודל מסך"
          className="-mx-4 flex gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none] sm:mx-0 sm:px-0"
        >
          <Chip active={size === null} onClick={() => setSize(null)}>
            הכול
          </Chip>
          {chips.map((b) => (
            <Chip key={b.key} active={size === b.key} onClick={() => setSize(b.key)}>
              <span dir="ltr">{b.label}</span>
            </Chip>
          ))}
        </div>
      )}

      <div
        className={cn(
          layout === "rail"
            ? "-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:thin] sm:mx-0 sm:gap-4 sm:px-0"
            : "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5",
          chips.length > 1 ? "" : "mt-3",
        )}
      >
        {shown.map(({ product, inches, panel }) => (
          <Card
            key={product.id}
            product={product}
            inches={inches}
            panel={panel}
            className={
              layout === "rail"
                ? "w-[70%] max-w-[17rem] shrink-0 snap-start sm:w-[calc(33.333%-11px)] sm:max-w-none lg:w-[calc(25%-12px)] xl:w-[calc(20%-13px)]"
                : undefined
            }
          />
        ))}
      </div>
    </>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "h-9 shrink-0 border px-4 text-sm font-semibold transition-colors",
        active ? "border-black bg-black text-white" : "border-black/20 bg-white text-black hover:border-black",
      )}
    >
      {children}
    </button>
  );
}

function Card({
  product,
  inches,
  panel,
  className,
}: {
  product: ProductCardData;
  inches: number | null;
  panel: string | null;
  className?: string;
}) {
  const href = `/product/${product.slug}`;

  return (
    <article className={cn("bg-card text-foreground flex flex-col border border-black/15", className)}>
      {/* What sets this set apart from the one beside it, first. */}
      {(inches !== null || panel) && (
        <div className="flex items-baseline gap-2 px-3 pt-3">
          {inches !== null && (
            <span dir="ltr" className="text-4xl leading-none font-black tracking-tight tabular-nums">
              {inches}″
            </span>
          )}
          {panel && <span className="text-muted-foreground text-xs font-semibold">{panel}</span>}
        </div>
      )}

      <div className="relative">
        <Link href={href} className="relative mx-3 mt-2 block aspect-[16/10] bg-white">
          {product.imageUrl && (
            <Image
              src={product.imageUrl}
              // Empty for the reason the ordinary card gives: the title link
              // below names the product, and a broken picture must not paint
              // a paragraph where the photograph was.
              alt=""
              fill
              className="object-contain"
              sizes="(min-width: 1280px) 18vw, (min-width: 1024px) 22vw, (min-width: 640px) 30vw, 62vw"
              referrerPolicy="no-referrer"
            />
          )}
        </Link>
        <FavoriteButton productId={product.id} className="absolute top-1 end-2" />
      </div>

      <div className="flex flex-1 flex-col p-3">
        <Link href={href} className="line-clamp-2 min-h-10 text-sm leading-5 font-medium hover:underline">
          {product.title}
        </Link>

        <div className="mt-2.5">
          <div className="text-2xl leading-tight font-bold tabular-nums">{formatPrice(product.price)}</div>
          <p className="text-muted-foreground text-xs">
            {BLACK_NOVEMBER_LABEL} · {BLACK_NOVEMBER_LIMITED}
          </p>
          {product.installmentMonths && (
            <p className="text-muted-foreground text-xs">
              {formatInstallment(product.price, product.installmentMonths)}
            </p>
          )}
        </div>

        <div className="mt-auto pt-3">
          <AddToCartButton
            productId={product.id}
            slug={product.slug}
            price={product.price}
            disabled={product.stockStatus === "OUT_OF_STOCK"}
            size="sm"
            className="h-10 w-full rounded-none text-sm font-bold"
            label={product.stockStatus === "OUT_OF_STOCK" ? "אזל מהמלאי" : "הוספה לעגלה"}
          />
        </div>
      </div>
    </article>
  );
}
