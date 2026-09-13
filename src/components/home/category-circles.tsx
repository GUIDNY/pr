import Link from "next/link";
import Image from "next/image";
import type { CategoryTile } from "@/lib/queries/categories";

/**
 * A row of round category tiles that scrolls sideways — the shape every
 * shopping app a phone already has opens on, right under the search: a
 * photograph of the thing, its name beneath, a flick to see more. Real
 * product photographs from the catalogue (the sampler's curated picks),
 * on white discs so a black fridge and a silver oven sit in the same row
 * without one shouting.
 */
export function CategoryCircles({ tiles, className }: { tiles: CategoryTile[]; className?: string }) {
  if (tiles.length === 0) return null;
  return (
    <nav aria-label="קטגוריות" className={className}>
      <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tiles.slice(0, 14).map((t) => (
          <li key={t.slug} className="w-[72px] shrink-0">
            <Link href={`/category/${t.slug}`} className="group flex flex-col items-center gap-1.5">
              <span className="ring-border group-active:ring-brand relative block size-[68px] overflow-hidden rounded-full bg-white shadow-sm ring-1">
                <Image
                  src={t.imageUrl}
                  alt=""
                  fill
                  sizes="68px"
                  className="object-contain p-2.5"
                  referrerPolicy="no-referrer"
                />
              </span>
              <span className="line-clamp-2 text-center text-[11px] leading-tight font-medium">{t.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
