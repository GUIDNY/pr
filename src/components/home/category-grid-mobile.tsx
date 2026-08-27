import Link from "next/link";
import Image from "next/image";
import type { CategoryTile } from "@/lib/queries/categories";

// Every category that actually has real, in-stock products, each tile
// using that category's own real top product photo (object-contain, not
// cropped) instead of a background-image card — a plain "product photo +
// label" grid instead of a card with a lifestyle background. No
// fabricated icons standing in for categories with no real photo — see
// getCategoryTilesWithImages, which already drops those (and a couple of
// hand-corrected miscategorized ones).
export function CategoryGrid({ tiles }: { tiles: CategoryTile[] }) {
  if (tiles.length === 0) return null;

  return (
    <section className="mx-auto max-w-7xl px-4 py-6 sm:py-10">
      <h2 className="mb-4 text-xl font-bold sm:mb-6 sm:text-2xl">כל הקטגוריות</h2>
      {/* Desktop deliberately denser/smaller than mobile — 6 then 9 columns
          instead of 4 then 6, closer to a compact icon-grid than big
          tiles. Mobile's own 3-column size is untouched. */}
      <div className="grid grid-cols-3 gap-x-2 gap-y-5 sm:grid-cols-6 sm:gap-x-3 sm:gap-y-6 lg:grid-cols-9">
        {tiles.map((tile) => (
          <Link
            key={tile.slug}
            href={`/category/${tile.slug}`}
            className="group/tile flex flex-col items-center gap-1.5 text-center sm:gap-2"
          >
            <div className="relative aspect-square w-full">
              <Image
                src={tile.imageUrl}
                alt=""
                fill
                sizes="(min-width: 1024px) 110px, (min-width: 640px) 140px, 120px"
                className="object-contain transition-transform duration-300 group-hover/tile:scale-105"
              />
            </div>
            <span className="line-clamp-2 text-xs leading-tight font-medium">{tile.name}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
