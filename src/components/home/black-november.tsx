import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ProductCardData } from "@/components/product/product-card";
import { BlackNovemberShelf } from "@/components/home/black-november-shelf";
import { BLACK_NOVEMBER_LIMITED, blackNovemberScope } from "@/lib/campaigns/black-november";
import { formatPrice } from "@/lib/format";

/**
 * "בלאק נובמבר" — on the homepage and the whole of /black-november.
 *
 * One black strip that says what the sale is, and under it the shelf.
 *
 * Three earlier versions put the weight in the wrong place. A rail of white
 * cards on a gold-edged panel; a dark panel with a glow and gradient
 * lettering, which the owner called generated; then two large flat blocks, a
 * black one and a white one with a photograph, which on a phone filled more
 * than a screen before the first price and still left fifteen cards looking
 * alike. So the heading is now a strip — the name, one line of facts, a link
 * — and the space goes to the products, arranged by screen size
 * (black-november-shelf.tsx).
 *
 * Flat black, white and the brand's orange in one thin rule and one button.
 * No gradient, no glow, no badge. The site's own typeface, heavy only in the
 * name and in the size on each card.
 *
 * What it says is the owner's decision (lib/campaigns/black-november.ts): the
 * product's ordinary price, named as the campaign's and as temporary. No
 * struck-through number, no percentage, no countdown, no free-delivery tag.
 *
 * The strip is server-rendered and every card is in the server's HTML, so
 * the section has its full height when the page arrives.
 */
export function BlackNovember({
  products,
  layout = "rail",
  heading = "h2",
  viewAllHref,
  total,
  lowestPrice,
}: {
  products: ProductCardData[];
  /* The whole campaign, when the row shows only part of it. */
  total?: number;
  lowestPrice?: number;
  /* "rail": one row that scrolls sideways, for the homepage. "grid": all of
     them, for the campaign's own page. */
  layout?: "rail" | "grid";
  heading?: "h1" | "h2";
  viewAllHref?: string;
}) {
  if (products.length === 0) return null;

  const scope = blackNovemberScope(products);
  const lowest = lowestPrice ?? Math.min(...products.map((p) => p.price));
  const Heading = heading;

  return (
    <section aria-labelledby="black-november-title" className="mx-auto max-w-7xl px-4 py-5 sm:py-7">
      {/* A white strip with a black name and the orange rule (version A, 16
          November). The black block was a screen's worth of ink on a phone
          before the first television; this is two lines. */}
      <div className="border-brand flex items-end justify-between gap-4 border-b-4 pb-3">
        <div className="min-w-0">
          <Heading
            id="black-november-title"
            className="text-[clamp(1.75rem,8vw,2.25rem)] leading-none font-black tracking-tight sm:text-5xl"
          >
            בלאק נובמבר
          </Heading>
          <p className="text-muted-foreground mt-1.5 text-sm font-medium sm:text-base">
            {scope.subject} · {(total ?? products.length).toLocaleString("he-IL")} דגמים · מ־{formatPrice(lowest)} · {BLACK_NOVEMBER_LIMITED}
          </p>
        </div>
        {viewAllHref && (
          <Link
            href={viewAllHref}
            className="text-brand hidden shrink-0 items-center gap-1 text-sm font-bold hover:underline sm:inline-flex"
          >
            לכל הדגמים
            <ArrowLeft className="size-4" />
          </Link>
        )}
      </div>

      {/* The homepage shows four as a grid and links to the rest; the
          campaign page shows them all. */}
      <BlackNovemberShelf
        products={products}
        layout={layout === "rail" ? "grid" : layout}
        limit={layout === "rail" ? 4 : undefined}
        viewAllHref={layout === "rail" ? viewAllHref : undefined}
        total={total}
      />
    </section>
  );
}
