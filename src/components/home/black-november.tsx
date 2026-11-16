import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import type { ProductCardData } from "@/components/product/product-card";
import { FavoriteButton } from "@/components/product/favorite-button";
import { AddToCartButton } from "@/components/product/add-to-cart-button";
import { BLACK_NOVEMBER_LABEL, BLACK_NOVEMBER_LIMITED, blackNovemberScope } from "@/lib/campaigns/black-november";
import { formatInstallment, formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * "בלאק נובמבר" — the banner on the homepage and the whole of /black-november.
 *
 * Built the way a shop prints a campaign, not the way a template draws one.
 * Two flat blocks side by side: black with the name of the sale set large in
 * white, and white with a photograph of one of the televisions and an orange
 * price sticker on its corner. Under them, the products on the page's own
 * white, in plain bordered cards.
 *
 * The version before this was a dark panel with an orange glow, gradient
 * lettering, an English strapline and two pills on every card, and the owner
 * said what it looked like: something generated. So the rules here are the
 * ones a print buyer would recognise — one black, one white, one orange, all
 * flat; square corners; a single heavy typeface doing the work; a product
 * photograph as the picture; nothing that glows, fades or floats.
 *
 * What it says is still the owner's decision (lib/campaigns/black-november.ts):
 * the product's ordinary price, named as the campaign's and as temporary. No
 * struck-through number, no percentage, no countdown, and no free-delivery
 * tag — the terms keep that for ordinary courier, and a large television is
 * not one.
 *
 * No client code beyond the cart and favourite buttons every card has, and
 * no image, font or library added: the photograph is one already in the row.
 */
export function BlackNovember({
  products,
  layout = "rail",
  heading = "h2",
  viewAllHref,
}: {
  products: ProductCardData[];
  /* "rail": one row that scrolls sideways, for the homepage. "grid": all of
     them, for the campaign's own page. */
  layout?: "rail" | "grid";
  heading?: "h1" | "h2";
  viewAllHref?: string;
}) {
  if (products.length === 0) return null;

  const scope = blackNovemberScope(products);
  const lowest = products.reduce((a, b) => (b.price < a.price ? b : a));
  /* The picture is of the product the sticker's price belongs to, so the two
     halves of the banner are one true statement. */
  const pictured = lowest.imageUrl ? lowest : (products.find((p) => p.imageUrl) ?? lowest);
  const Heading = heading;

  return (
    <section aria-labelledby="black-november-title" className="mx-auto max-w-7xl px-4 py-5 sm:py-7">
      <div className="grid overflow-hidden border-2 border-black md:grid-cols-2">
        <div className="flex flex-col justify-center bg-black px-5 py-7 text-white sm:px-9 sm:py-10">
          <p className="text-brand text-sm font-bold sm:text-base">{BLACK_NOVEMBER_LIMITED}</p>
          <Heading
            id="black-november-title"
            className="mt-1 text-[clamp(2.6rem,13.5vw,3.6rem)] leading-[0.9] font-black tracking-tight md:text-[4.25rem] lg:text-[5.5rem]"
          >
            בלאק
            <br />
            נובמבר
          </Heading>
          <span aria-hidden className="bg-brand mt-4 block h-1.5 w-20 sm:mt-5 sm:h-2 sm:w-28" />
          <p className="mt-4 text-lg leading-snug font-bold sm:mt-5 sm:text-2xl">{scope.headline}</p>
          {scope.note && <p className="mt-1 text-sm text-white/70 sm:text-base">{scope.note}</p>}
          {viewAllHref && (
            <Link
              href={viewAllHref}
              className="bg-brand text-brand-foreground hover:bg-brand-hover mt-6 inline-flex h-12 items-center gap-2 self-start px-6 text-base font-bold transition-colors"
            >
              לכל {products.length.toLocaleString("he-IL")} הדגמים
              <ArrowLeft className="size-4" />
            </Link>
          )}
        </div>

        <Link
          href={`/product/${pictured.slug}`}
          className="relative block min-h-56 bg-white sm:min-h-72 md:min-h-0"
          aria-label={pictured.title}
        >
          {pictured.imageUrl && (
            <Image
              src={pictured.imageUrl}
              alt=""
              fill
              className="object-contain p-6 sm:p-10"
              sizes="(min-width: 768px) 50vw, 100vw"
              referrerPolicy="no-referrer"
            />
          )}
          <span className="bg-brand text-brand-foreground absolute start-0 bottom-0 px-4 py-2.5 sm:px-5 sm:py-3">
            <span className="block text-xs font-bold sm:text-sm">החל מ־</span>
            <span className="block text-3xl leading-none font-black tabular-nums sm:text-4xl">
              {formatPrice(lowest.price)}
            </span>
          </span>
        </Link>
      </div>

      <div
        className={cn(
          "mt-4 sm:mt-5",
          layout === "rail"
            ? "-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:thin] sm:gap-4"
            : "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5"
        )}
      >
        {products.map((p) => (
          <BlackNovemberCard
            key={p.id}
            product={p}
            className={
              layout === "rail"
                ? "w-[62%] max-w-[16rem] shrink-0 snap-start sm:w-[calc(33.333%-11px)] sm:max-w-none lg:w-[calc(25%-12px)] xl:w-[calc(20%-13px)]"
                : undefined
            }
          />
        ))}
      </div>
    </section>
  );
}

function BlackNovemberCard({ product, className }: { product: ProductCardData; className?: string }) {
  const href = `/product/${product.slug}`;

  return (
    <article className={cn("bg-card text-foreground flex flex-col border border-black/15", className)}>
      {/* The campaign's name as a printed strip across the top of the card —
          one flat bar, the same on every card, in place of a badge. */}
      <p className="bg-black px-3 py-1.5 text-xs font-bold text-white">{BLACK_NOVEMBER_LABEL}</p>

      <div className="relative">
        <Link href={href} className="relative block aspect-[4/3] bg-white">
          {product.imageUrl && (
            <Image
              src={product.imageUrl}
              // Empty for the reason the ordinary card gives: the title link
              // below names the product, and a broken picture must not paint
              // a paragraph where the photograph was.
              alt=""
              fill
              className="object-contain p-3"
              sizes="(min-width: 1280px) 20vw, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 62vw"
              referrerPolicy="no-referrer"
            />
          )}
        </Link>
        <FavoriteButton productId={product.id} className="absolute top-2 end-2" />
      </div>

      <div className="flex flex-1 flex-col border-t border-black/10 p-3">
        <span className="text-muted-foreground text-xs font-semibold">{product.brandName}</span>
        <Link href={href} className="mt-0.5 line-clamp-2 min-h-10 text-sm leading-5 font-medium hover:underline">
          {product.title}
        </Link>

        <div className="mt-2.5">
          <div className="text-2xl leading-tight font-black tabular-nums sm:text-[1.7rem]">
            {formatPrice(product.price)}
          </div>
          <p className="text-muted-foreground text-xs">
            {BLACK_NOVEMBER_LIMITED}
            {product.installmentMonths ? ` · ${formatInstallment(product.price, product.installmentMonths)}` : ""}
          </p>
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
