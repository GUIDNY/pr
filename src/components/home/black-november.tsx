import { ProductCard, type ProductCardData } from "@/components/product/product-card";
import { BLACK_NOVEMBER_LABEL, BLACK_NOVEMBER_LIMITED } from "@/lib/campaigns/black-november";

/**
 * The homepage's "בלאק נובמבר" section.
 *
 * A dark panel so it reads as an event and not as one more rail, with the
 * shop's ordinary cards inside it — the same card, price and button a
 * visitor has already learned on the rest of the page. Each card wears the
 * campaign's name where a discount badge would go, and nothing here shows a
 * struck-through price or a percentage: the owner's instruction was a
 * temporary price, not a markdown (see lib/campaigns/black-november.ts).
 *
 * One row that scrolls sideways at every width, like the department rails:
 * fifteen televisions two to a row would be eight screens of a phone before
 * the first department. A little over two cards show on a phone, so the cut
 * one says there is more.
 *
 * The colours are fixed rather than taken from the theme, on purpose — the
 * panel is black in light mode and dark mode alike.
 */
export function BlackNovember({ products }: { products: ProductCardData[] }) {
  if (products.length === 0) return null;

  return (
    <section aria-labelledby="black-november-title" className="mx-auto max-w-7xl px-4 py-4 sm:py-6">
      <div className="relative overflow-hidden rounded-3xl bg-[radial-gradient(120%_120%_at_100%_0%,#2b2620_0%,#141414_45%,#0a0a0a_100%)] text-white shadow-[0_12px_36px_-16px_rgb(0_0_0/0.7)]">
        {/* a gold hairline inside the edge, and the month in outline behind the heading */}
        <span aria-hidden className="pointer-events-none absolute inset-1.5 rounded-[1.25rem] border border-[#ffc94d]/25" />
        <span
          aria-hidden
          dir="ltr"
          className="pointer-events-none absolute -top-5 left-2 select-none text-[6.5rem] font-black leading-none tracking-[-0.04em] text-transparent [-webkit-text-stroke:1.5px_rgb(255_201_77/0.14)] sm:-top-8 sm:left-6 sm:text-[11rem]"
        >
          11/26
        </span>

        <div className="relative px-4 pt-6 sm:px-7 sm:pt-8">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="rounded-sm bg-[#ffc94d] px-1.5 py-0.5 tracking-wide text-[#141414]">{BLACK_NOVEMBER_LIMITED}</span>
            <span className="text-white/75">
              {products.length.toLocaleString("he-IL")} מוצרים
            </span>
          </div>
          <h2 id="black-november-title" className="text-[2rem] font-black leading-none tracking-tight sm:text-5xl">
            בלאק <span className="text-[#ffc94d]">נובמבר</span>
          </h2>
          <p className="mt-2 max-w-xl text-sm font-medium text-white/85 sm:text-base">
            מחירי בלאק נובמבר על מוצרים נבחרים, {BLACK_NOVEMBER_LIMITED}.
          </p>
        </div>

        <div className="relative mt-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-5 [scrollbar-color:rgb(255_201_77/0.5)_transparent] [scrollbar-width:thin] sm:gap-4 sm:px-7 sm:pb-7">
          {products.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              ribbon={BLACK_NOVEMBER_LABEL}
              // text-foreground: the panel sets white text for its heading, and
              // a card is a white surface that would otherwise inherit it.
              className="text-foreground w-[calc(50%-18px)] shrink-0 snap-start sm:w-[calc(33.333%-11px)] lg:w-[calc(25%-12px)] xl:w-[calc(20%-13px)]"
            />
          ))}
        </div>
      </div>
    </section>
  );
}
