import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ProductCardData } from "@/components/product/product-card";
import { BlackNovemberShelf } from "@/components/home/black-november-shelf";
import { blackNovemberScope } from "@/lib/campaigns/black-november";
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
  const lowest = Math.min(...products.map((p) => p.price));
  const Heading = heading;

  return (
    <section aria-labelledby="black-november-title" className="mx-auto max-w-7xl px-4 py-5 sm:py-7">
      <div className="border-brand flex flex-col gap-4 border-b-4 bg-black px-5 py-5 text-white sm:flex-row sm:items-center sm:justify-between sm:gap-8 sm:px-8 sm:py-6">
        <div className="min-w-0">
          <Heading
            id="black-november-title"
            className="text-[clamp(2rem,10vw,2.5rem)] leading-none font-black tracking-tight sm:text-5xl"
          >
            בלאק נובמבר
          </Heading>
          <p className="mt-2 text-sm font-medium text-white/85 sm:text-base">
            {scope.subject} · {products.length.toLocaleString("he-IL")} דגמים · מ־{formatPrice(lowest)}
          </p>
        </div>
        {viewAllHref && (
          <Link
            href={viewAllHref}
            className="bg-brand text-brand-foreground hover:bg-brand-hover inline-flex h-11 shrink-0 items-center gap-2 self-start px-5 text-sm font-bold transition-colors sm:self-auto"
          >
            לכל הדגמים
            <ArrowLeft className="size-4" />
          </Link>
        )}
      </div>

      <BlackNovemberShelf products={products} layout={layout} />
    </section>
  );
}
