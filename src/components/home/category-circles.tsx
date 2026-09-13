"use client";

import Link from "next/link";
import Image from "next/image";
import { LayoutGrid } from "lucide-react";
import { DEPARTMENTS_OPEN_EVENT } from "@/lib/bottom-nav";
import type { CategoryTile } from "@/lib/queries/categories";

/**
 * Six round category tiles and an "everything" tile, in one row under the
 * search — the shape every shopping app a phone already has opens on. Six
 * rather than fourteen: a row that runs off the screen in small type reads
 * as clutter, six big ones read as a menu, and "הכל" opens the full
 * departments drawer for the rest. Real product photographs from the
 * catalogue (the sampler's curated picks) on white discs, so a black
 * fridge and a silver oven sit in the same row without one shouting.
 */
export function CategoryCircles({ tiles, className }: { tiles: CategoryTile[]; className?: string }) {
  if (tiles.length === 0) return null;
  const shown = tiles.slice(0, 6);
  const disc = "relative block size-[76px] overflow-hidden rounded-full bg-white shadow-sm ring-1 ring-black/5";
  return (
    <nav aria-label="קטגוריות" className={className}>
      <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {shown.map((t) => (
          <li key={t.slug} className="w-[76px] shrink-0">
            <Link href={`/category/${t.slug}`} className="group flex flex-col items-center gap-1.5 active:opacity-80">
              <span className={disc}>
                <Image src={t.imageUrl} alt="" fill sizes="76px" className="object-contain p-2.5" referrerPolicy="no-referrer" />
              </span>
              <span className="line-clamp-2 text-center text-xs leading-tight font-semibold">{t.name}</span>
            </Link>
          </li>
        ))}
        <li className="w-[76px] shrink-0">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event(DEPARTMENTS_OPEN_EVENT))}
            className="group flex w-full flex-col items-center gap-1.5 active:opacity-80"
          >
            <span className={`${disc} bg-brand/10 text-brand flex items-center justify-center ring-0`}>
              <LayoutGrid className="size-7" strokeWidth={1.75} />
            </span>
            <span className="text-xs leading-tight font-semibold">כל המחלקות</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
