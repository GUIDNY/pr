import Image from "next/image";
import Link from "next/link";
import type { SubcategoryTile } from "@/lib/queries/categories";
import { cn } from "@/lib/utils";

/**
 * The department's shelves as a row of photo tiles under the heading —
 * washing machines, dryers, dishwashers — each with its live count, the
 * one on this page marked. A shopper narrows by what a thing *is* before
 * they narrow by brand or price, and a mixed department grid asks them to
 * do it the other way round. Scrolls sideways on a phone.
 */
export function SubcategoryRow({ tiles, currentSlug }: { tiles: SubcategoryTile[]; currentSlug: string | null }) {
  return (
    <nav aria-label="תת-קטגוריות" className="-mx-4 mt-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <ul className="flex w-max gap-2.5">
        {tiles.map((t) => {
          const active = t.slug === currentSlug;
          return (
            <li key={t.slug}>
              <Link
                href={`/category/${t.slug}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "bg-card flex items-center gap-3 rounded-2xl border py-2 pe-4 ps-2 transition-all hover:-translate-y-0.5 hover:shadow-md",
                  active ? "border-brand ring-brand/20 ring-2" : "border-border hover:border-brand/40"
                )}
              >
                <span className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-white">
                  {t.imageUrl && (
                    <Image src={t.imageUrl} alt="" fill sizes="56px" className="object-contain p-1" referrerPolicy="no-referrer" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className={cn("block text-sm font-semibold whitespace-nowrap", active && "text-brand")}>{t.name}</span>
                  <span className="text-muted-foreground block text-xs">{t.count.toLocaleString("he-IL")} מוצרים</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
