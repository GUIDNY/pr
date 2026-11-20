"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import Image from "next/image";
import type { ProductCardData } from "@/components/product/product-card";
import { FavoriteButton } from "@/components/product/favorite-button";
import { AddToCartButton } from "@/components/product/add-to-cart-button";
import {
  BLACK_NOVEMBER_LABEL,
  TV_SIZE_BUCKETS,
  televisionFacts,
  tvSizeBucket,
  type TvSizeBucketKey,
} from "@/lib/campaigns/black-november";
import { formatInstallment, formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FREE_DELIVERY_THRESHOLD } from "@/lib/delivery";
import { StickyTabsBar } from "@/components/product/sticky-tabs-bar";

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
  limit,
  viewAllHref,
}: {
  products: ProductCardData[];
  layout: "rail" | "grid";
  /* With a limit the grid shows that many and then a link to the rest — the
     homepage: four sets on a phone screen, then "לכל 15 הדגמים". */
  limit?: number;
  viewAllHref?: string;
}) {
  const items = useMemo(
    () =>
      products
        .map((product) => {
          const facts = televisionFacts(product.title);
          return { product, ...facts, bucket: tvSizeBucket(facts.inches) };
        })
        /* The order the query gave — the campaign's own ranking
           (getBlackNovemberProducts: the living-room sizes from the brands
           people search for first). This used to re-sort smallest first,
           which undid that ranking and opened the campaign on a 27" monitor
           and the 32" sets. */
        .map((item, rank) => ({ ...item, rank })),
    [products],
  );

  /* Only the sizes that are actually on the shelf. */
  const chips = TV_SIZE_BUCKETS.filter((b) => items.some((i) => i.bucket === b.key));
  const [size, setSize] = useState<TvSizeBucketKey | null>(null);
  /* Brands and sorting on the campaign page only — the homepage shows four. */
  const full = layout === "grid" && !limit;
  const brands = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of items) if (i.product.brandName) counts.set(i.product.brandName, (counts.get(i.product.brandName) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  }, [items]);
  const [brand, setBrand] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("recommended");

  const matching = items
    .filter((i) => (size ? i.bucket === size : true))
    .filter((i) => (brand ? i.product.brandName === brand : true))
    .sort(SORTS[sort].compare);
  const shown = limit ? matching.slice(0, limit) : matching;

  return (
    <>
      {chips.length > 1 &&
        (() => {
          const row = (
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
          );
          /* On the /black-november page the grid is fifteen sets long — five
             phone screens — and the chips were only at the top, so choosing
             another size meant scrolling all the way back. There they stay
             under the header (the same measured offset the product page's
             tabs use). The homepage rail is one row high and needs nothing. */
          return layout === "grid" && !limit ? <StickyTabsBar>{row}</StickyTabsBar> : row;
        })()}

      {full && (brands.length > 1 || items.length > 8) && (
        <div className="flex flex-col gap-2 pb-3">
          {brands.length > 1 && (
            <div
              role="group"
              aria-label="סינון לפי מותג"
              className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0"
            >
              <Chip active={brand === null} onClick={() => setBrand(null)}>
                כל המותגים
              </Chip>
              {brands.map((name) => (
                <Chip key={name} active={brand === name} onClick={() => setBrand(brand === name ? null : name)}>
                  {name}
                </Chip>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground" aria-live="polite">
              {matching.length.toLocaleString("he-IL")} דגמים
            </span>
            <label className="flex items-center gap-2">
              <span className="text-muted-foreground">מיון:</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="h-11 border border-black/20 bg-white px-2 text-sm font-semibold sm:h-9"
              >
                {(Object.keys(SORTS) as SortKey[]).map((key) => (
                  <option key={key} value={key}>
                    {SORTS[key].label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      )}

      <div
        className={cn(
          layout === "rail"
            ? "-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:thin] sm:mx-0 sm:gap-4 sm:px-0"
            : limit
              ? /* Four on the homepage: two rows of two on a phone, one row of
                   four from a tablet up, never a row with a gap in it. */
                "grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
              : "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5",
          chips.length > 1 ? "" : "mt-3",
        )}
      >
        {shown.map(({ product, inches, panel }, index) => (
          <Card
            key={product.id}
            product={product}
            inches={inches}
            panel={panel}
            /* The campaign page opens on these four: fetch them with the page
               rather than after it, so the first screen is not four empty
               frames. The homepage section sits below the fold and stays lazy. */
            eager={layout === "grid" && !limit && index < 4}
            className={
              layout === "rail"
                ? "w-[70%] max-w-[17rem] shrink-0 snap-start sm:w-[calc(33.333%-11px)] sm:max-w-none lg:w-[calc(25%-12px)] xl:w-[calc(20%-13px)]"
                : undefined
            }
          />
        ))}
      </div>

      {limit && viewAllHref && products.length > shown.length && (
        <Link
          href={viewAllHref}
          className="mt-3 flex h-11 items-center justify-center gap-2 border border-black text-sm font-bold hover:bg-black hover:text-white"
        >
          לכל {products.length.toLocaleString("he-IL")} הדגמים
          <ArrowLeft className="size-4" />
        </Link>
      )}
    </>
  );
}

type ShelfItem = { product: ProductCardData; inches: number | null; rank: number };
type SortKey = "recommended" | "priceAsc" | "priceDesc" | "sizeDesc";
const SORTS: Record<SortKey, { label: string; compare: (a: ShelfItem, b: ShelfItem) => number }> = {
  recommended: { label: "מומלץ", compare: (a, b) => a.rank - b.rank },
  priceAsc: { label: "מחיר: מהנמוך לגבוה", compare: (a, b) => a.product.price - b.product.price || a.rank - b.rank },
  priceDesc: { label: "מחיר: מהגבוה לנמוך", compare: (a, b) => b.product.price - a.product.price || a.rank - b.rank },
  /* A product whose title states no size goes last, never placed by a guess. */
  sizeDesc: { label: "מסך: מהגדול לקטן", compare: (a, b) => (b.inches ?? -1) - (a.inches ?? -1) || a.rank - b.rank },
};

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        /* 44px on a phone — the size a fingertip needs; 36 was a target to
           aim for. Back to 36 from sm:, where it is a mouse. */
        "h-11 shrink-0 border px-4 text-sm font-semibold transition-colors sm:h-9",
        active ? "border-black bg-black text-white" : "border-black/20 bg-white text-black hover:border-black",
      )}
    >
      {children}
    </button>
  );
}

/* A quiet tint per panel kind, so fifteen sets that share one photograph
   still read apart at a glance. Flat colours, no gradient. */
const PANEL_TONE: Record<string, string> = {
  OLED: "bg-black text-white",
  "QNED Mini LED": "bg-orange-100 text-orange-900",
  QNED: "bg-amber-100 text-amber-900",
  NanoCell: "bg-sky-100 text-sky-900",
  QLED: "bg-violet-100 text-violet-900",
};

/** The manufacturer's model code out of a title ("…דגם 55QNED8MB6T"): the last
    Latin token of six or more characters that has both letters and digits. */
function modelFromTitle(title: string): string | null {
  const tokens = title.match(/[A-Za-z0-9][A-Za-z0-9-]{5,}/g) ?? [];
  const codes = tokens.filter((t) => /\d/.test(t) && /[A-Za-z]/.test(t) && !/^\d+(hz|w)$/i.test(t));
  return codes.length > 0 ? codes[codes.length - 1] : null;
}

function Card({
  product,
  inches,
  panel,
  className,
  eager = false,
}: {
  product: ProductCardData;
  inches: number | null;
  panel: string | null;
  className?: string;
  eager?: boolean;
}) {
  const href = `/product/${product.slug}`;
  const model = modelFromTitle(product.title);
  /* One short line in place of the two-line title: the size and the panel are
     already above, so what is left to say is whose it is and which model. The
     full title stays for screen readers and in the link's tooltip. */
  const shortLine = [product.brandName, model].filter(Boolean).join(" · ");

  return (
    <article className={cn("bg-card text-foreground flex flex-col border border-black/15", className)}>
      {/* What sets this set apart from the one beside it, first. */}
      {(inches !== null || panel) && (
        <div className="flex items-center gap-2 px-3 pt-2.5">
          {inches !== null && (
            <span dir="ltr" className="text-3xl leading-none font-black tracking-tight tabular-nums">
              {inches}″
            </span>
          )}
          {panel && (
            <span className={cn("px-1.5 py-0.5 text-[11px] leading-tight font-bold", PANEL_TONE[panel] ?? "bg-muted")}>
              {panel}
            </span>
          )}
        </div>
      )}

      {/* The photograph at the card's full width. It sat inside a margin in a
          16:10 box and came out a third of the card on a phone. */}
      <div className="relative mt-2">
        <Link href={href} className="relative block aspect-[16/10] bg-white" tabIndex={-1} aria-hidden="true">
          {product.imageUrl && (
            <Image
              src={product.imageUrl}
              alt=""
              fill
              /* Cover, not contain. Every photograph here is square, with the
                 set across 86% of its width and 51–56% of its height (all 15
                 measured, 16 November). Contained in a 16:10 frame the square
                 shrank to the frame's height and the set came out 54% of the
                 card's width; covering it fills the width and trims only the
                 white above and below — the set, 56% tall at most, sits inside
                 the frame's 62.5% with room to spare. */
              className="object-cover"
              loading={eager ? "eager" : "lazy"}
              sizes="(min-width: 1280px) 18vw, (min-width: 1024px) 22vw, (min-width: 640px) 30vw, 48vw"
              referrerPolicy="no-referrer"
            />
          )}
        </Link>
        {/* At the start corner: with the set now filling the frame, the end
            corner sat on the maker's logo printed on the screen. */}
        <FavoriteButton productId={product.id} className="absolute top-1 start-1" />
      </div>

      <div className="flex flex-1 flex-col px-3 pt-2 pb-3">
        <Link href={href} title={product.title} className="relative truncate text-sm font-medium hover:underline">
          <span aria-hidden="true">{shortLine || product.title}</span>
          <span className="sr-only">{product.title}</span>
        </Link>
        {/* What sets it apart, from its own specs only; nothing when none
            is recorded. */}
        {product.tvFacts && product.tvFacts.length > 0 && (
          <p className="text-muted-foreground mt-0.5 truncate text-xs" dir="rtl">
            {product.tvFacts.join(" · ")}
          </p>
        )}

        {/* Price and the button on one line; the campaign's wording under them. */}
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <span className="min-w-0 text-lg leading-none font-bold whitespace-nowrap tabular-nums sm:text-xl">{formatPrice(product.price)}</span>
          <AddToCartButton
            productId={product.id}
            slug={product.slug}
            price={product.price}
            disabled={product.stockStatus === "OUT_OF_STOCK"}
            /* The cart icon alone: with the word, price and button came to
               ~160px against the ~132px inside a card on a 360px phone, and
               the button stuck out past the card's edge. */
            size="icon"
            className="size-10 shrink-0 rounded-none [&_svg]:size-5"
            label={product.stockStatus === "OUT_OF_STOCK" ? "אזל מהמלאי" : `הוספה לעגלה: ${product.title}`}
          />
        </div>
        <p className="text-muted-foreground mt-1.5 text-[11px] leading-tight">
          {/* "לזמן מוגבל" is said once, in the section's heading, rather than
              on every card where it broke onto a second line at 375. */}
          {BLACK_NOVEMBER_LABEL}
          {/* From the shop's own threshold (lib/delivery), the same constant
              the top strip reads — never typed here. */}
          {product.price >= FREE_DELIVERY_THRESHOLD ? " · משלוח חינם" : ""}
          {product.installmentMonths ? ` · ${formatInstallment(product.price, product.installmentMonths)}` : ""}
        </p>
      </div>
    </article>
  );
}
