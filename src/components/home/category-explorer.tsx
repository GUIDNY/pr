import Link from "next/link";
import Image from "next/image";
import {
  Tv,
  Speaker,
  Refrigerator,
  WashingMachine,
  Utensils,
  Flame,
  Coffee,
  Sparkles,
  Wind,
  Thermometer,
  Laptop,
  Scissors,
  Package,
  type LucideIcon,
} from "lucide-react";
import { CATEGORY_TREE } from "@/lib/category-tree";
import { CATEGORY_TILE_IMAGES } from "@/lib/marketing-images";

const ICONS: Record<string, LucideIcon> = {
  Tv,
  Speaker,
  Refrigerator,
  WashingMachine,
  Utensils,
  Flame,
  Coffee,
  Sparkles,
  Wind,
  Thermometer,
  Laptop,
  Scissors,
  Package,
};

export function CategoryExplorer() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-10">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-xl font-bold sm:text-2xl">קטגוריות מובילות</h2>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {CATEGORY_TREE.map((dept) => {
          const Icon = ICONS[dept.icon] ?? Package;
          const image = CATEGORY_TILE_IMAGES[dept.slug];

          if (image) {
            return (
              <Link
                key={dept.slug}
                href={`/category/${dept.slug}`}
                className="group border-border relative aspect-[4/3] overflow-hidden rounded-xl border shadow-sm transition-all hover:shadow-lg"
              >
                <Image
                  src={image}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 23vw, (min-width: 640px) 31vw, 46vw"
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <div className="from-primary/85 absolute inset-0 bg-gradient-to-t via-transparent to-transparent" />
                <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 p-3">
                  <span className="bg-background/90 text-brand flex size-8 shrink-0 items-center justify-center rounded-full">
                    <Icon className="size-4" strokeWidth={1.75} />
                  </span>
                  <span className="text-sm font-semibold text-white">{dept.name}</span>
                </div>
              </Link>
            );
          }

          return (
            <Link
              key={dept.slug}
              href={`/category/${dept.slug}`}
              className="group border-border bg-card hover:border-brand/30 flex flex-col items-center justify-center gap-2 rounded-xl border p-4 text-center transition-all hover:shadow-md"
            >
              <span className="bg-brand/10 text-brand flex size-12 items-center justify-center rounded-full transition-transform group-hover:scale-110">
                <Icon className="size-6" strokeWidth={1.5} />
              </span>
              <span className="text-xs leading-tight font-medium sm:text-sm">{dept.name}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
