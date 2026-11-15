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
 * "בלאק נובמבר" — the panel on the homepage and the whole of /black-november.
 *
 * Near-black, with the shop's own orange as the only colour: a glow behind
 * the heading, the word נובמבר, the label over each price and the button.
 * The first version borrowed gold, which belongs to nobody here, and put the
 * shop's ordinary white cards on the dark panel, which read as a rail that
 * had been given a frame. These cards are the panel's own: the photograph on
 * a white tile, because the manufacturers' pictures are cut out on white,
 * and everything else in white type on the dark surface.
 *
 * What it says is the owner's decision (see lib/campaigns/black-november.ts):
 * the product's ordinary price, labelled as the campaign's and as temporary.
 * No struck-through number, no percentage, and no countdown — there is no
 * end date to count down to, and a clock that does not end is a lie with
 * animation.
 *
 * Nothing here is client code except the two buttons every card on the site
 * already carries, and the decoration is CSS gradients — no image, no font,
 * no library is added to the homepage for it.
 */
export function BlackNovember({
  products,
  layout = "rail",
  heading = "h2",
  viewAllHref,
}: {
  products: ProductCardData[];
  /* "rail": one row that scrolls sideways, for the homepage, where fifteen
     televisions in a grid would push every department a screen further down.
     "grid": all of them, for the campaign's own page. */
  layout?: "rail" | "grid";
  heading?: "h1" | "h2";
  viewAllHref?: string;
}) {
  if (products.length === 0) return null;

  const scope = blackNovemberScope(products);
  const lowest = Math.min(...products.map((p) => p.price));
  const Heading = heading;

  return (
    <section aria-labelledby="black-november-title" className="mx-auto max-w-7xl px-4 py-4 sm:py-6">
      <div className="relative isolate overflow-hidden rounded-[1.75rem] bg-[#0a0a0c] text-white shadow-[0_24px_60px_-28px_rgb(0_0_0/0.85)]">
        {/* the orange behind the heading, a cooler echo in the far corner,
            and a hairline grid so the black has a surface */}
        <span
          aria-hidden
          className="bg-brand pointer-events-none absolute -top-40 -right-32 -z-10 size-[30rem] rounded-full opacity-35 blur-[110px] sm:size-[40rem]"
        />
        <span
          aria-hidden
          className="bg-brand pointer-events-none absolute -bottom-52 -left-40 -z-10 size-[26rem] rounded-full opacity-15 blur-[120px]"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(rgb(255_255_255/0.035)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/0.035)_1px,transparent_1px)] bg-[size:44px_44px] [mask-image:linear-gradient(to_bottom,black,transparent_70%)]"
        />
        <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[1.75rem] ring-1 ring-white/10 ring-inset" />

        <div className="flex flex-col gap-6 px-5 pt-8 sm:px-9 sm:pt-11 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2.5 text-xs font-bold">
              <span className="bg-brand text-brand-foreground rounded-full px-2.5 py-1">{BLACK_NOVEMBER_LIMITED}</span>
              <span dir="ltr" className="tracking-[0.28em] text-white/45">
                BLACK NOVEMBER
              </span>
            </div>
            <Heading
              id="black-november-title"
              className="text-[clamp(2.1rem,12.5vw,2.9rem)] leading-[0.95] font-black tracking-tight sm:text-7xl"
            >
              בלאק{" "}
              <span className="from-brand bg-gradient-to-l to-[#ffb36b] bg-clip-text text-transparent">נובמבר</span>
            </Heading>
            <p className="mt-3 text-lg leading-snug font-bold text-white sm:mt-4 sm:text-2xl">{scope.headline}</p>
            {scope.note && <p className="mt-1.5 text-sm text-white/60 sm:text-base">{scope.note}</p>}
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-4">
            <dl className="flex items-center gap-6">
              <div>
                <dd className="text-2xl leading-none font-black tabular-nums sm:text-3xl">
                  {products.length.toLocaleString("he-IL")}
                </dd>
                <dt className="mt-1 text-xs text-white/55">דגמים</dt>
              </div>
              <div className="h-9 w-px bg-white/15" aria-hidden />
              <div>
                <dd className="text-2xl leading-none font-black tabular-nums sm:text-3xl">{formatPrice(lowest)}</dd>
                <dt className="mt-1 text-xs text-white/55">החל מ־</dt>
              </div>
            </dl>
            {viewAllHref && (
              <Link
                href={viewAllHref}
                className="group/cta inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-bold text-[#0a0a0c] transition hover:bg-white/90"
              >
                לכל הדגמים
                <ArrowLeft className="size-4 transition-transform group-hover/cta:-translate-x-0.5" />
              </Link>
            )}
          </div>
        </div>

        <div
          className={cn(
            "mt-7 px-5 pb-6 sm:mt-9 sm:px-9 sm:pb-9",
            layout === "rail"
              ? "flex snap-x snap-mandatory gap-3 overflow-x-auto [scrollbar-color:rgb(255_255_255/0.25)_transparent] [scrollbar-width:thin] sm:gap-4"
              : "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5"
          )}
        >
          {products.map((p) => (
            <BlackNovemberCard
              key={p.id}
              product={p}
              className={
                layout === "rail"
                  ? "w-[74%] max-w-[17.5rem] shrink-0 snap-start sm:w-[calc(40%-10px)] sm:max-w-none lg:w-[calc(28%-12px)] xl:w-[calc(22%-12px)]"
                  : undefined
              }
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function BlackNovemberCard({ product, className }: { product: ProductCardData; className?: string }) {
  const href = `/product/${product.slug}`;

  return (
    <article
      className={cn(
        "group flex flex-col rounded-2xl bg-white/[0.055] p-2 ring-1 ring-white/10 transition hover:bg-white/[0.085] hover:ring-white/20",
        className
      )}
    >
      <div className="relative">
        <Link href={href} className="relative block aspect-[4/3] overflow-hidden rounded-xl bg-white">
          {product.imageUrl && (
            <Image
              src={product.imageUrl}
              // Empty for the reason the ordinary card gives: the title link
              // below names the product, and a broken picture must not paint
              // a paragraph where the photograph was.
              alt=""
              fill
              className="object-contain p-3 transition-transform duration-300 group-hover:scale-[1.04]"
              sizes="(min-width: 1280px) 22vw, (min-width: 1024px) 28vw, (min-width: 640px) 40vw, 74vw"
              referrerPolicy="no-referrer"
            />
          )}
        </Link>
        <FavoriteButton productId={product.id} className="absolute top-2 end-2" />
      </div>

      <div className="flex flex-1 flex-col px-1.5 pt-3 pb-1.5 sm:px-2">
        <span className="text-xs font-semibold text-white/55">{product.brandName}</span>
        <Link
          href={href}
          className="mt-0.5 line-clamp-2 min-h-10 text-sm leading-5 font-medium text-white hover:underline sm:text-[0.95rem]"
        >
          {product.title}
        </Link>

        <div className="mt-3">
          <span className="text-brand text-[11px] font-bold sm:text-xs">{BLACK_NOVEMBER_LABEL}</span>
          <div className="text-[1.65rem] leading-tight font-black tabular-nums sm:text-3xl">
            {formatPrice(product.price)}
          </div>
          {product.installmentMonths && (
            <span className="text-xs text-white/55">{formatInstallment(product.price, product.installmentMonths)}</span>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-medium sm:text-xs">
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-white/80">{BLACK_NOVEMBER_LIMITED}</span>
          {/* No "משלוח חינם" here, although the ordinary card says it over the
              threshold. The terms keep free delivery for products that go by
              ordinary courier, and a television of 75 inches and up may not —
              a promise this panel has no way to check per product is one it
              does not make. The product page and the checkout say what the
              delivery costs. */}
        </div>

        <div className="mt-auto pt-3">
          <AddToCartButton
            productId={product.id}
            slug={product.slug}
            price={product.price}
            disabled={product.stockStatus === "OUT_OF_STOCK"}
            size="sm"
            className="h-10 w-full rounded-xl text-sm font-bold"
            label={product.stockStatus === "OUT_OF_STOCK" ? "אזל מהמלאי" : "הוספה לעגלה"}
          />
        </div>
      </div>
    </article>
  );
}
