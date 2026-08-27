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
import { getNavigableCategoryTree } from "@/lib/queries/categories";
import { DEPARTMENT_ICON_MAP } from "@/lib/department-icons";
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

// A fixed tile width instead of the previous responsive grid — required for
// a horizontal marquee, since the track's own width (twice the real content,
// for the seamless loop) has to be predictable rather than however many
// columns happen to fit.
const TILE_WIDTH = "w-48 sm:w-60";

export async function CategoryExplorer() {
  const departments = await getNavigableCategoryTree();
  if (departments.length === 0) return null;

  // Duplicated once so the CSS marquee can loop seamlessly — same trick as
  // the brand strip below it.
  const track = [...departments, ...departments];

  return (
    <section className="mx-auto max-w-7xl px-4 py-10">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-xl font-bold sm:text-2xl">קטגוריות מובילות</h2>
      </div>
      <div className="group relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_3%,black_97%,transparent)]">
        <div className="animate-category-marquee group-hover:[animation-play-state:paused] flex w-max gap-3">
          {track.map((dept, i) => {
            const Icon = ICONS[DEPARTMENT_ICON_MAP[dept.slug]] ?? Package;
            const image = CATEGORY_TILE_IMAGES[dept.slug];

            if (image) {
              return (
                <Link
                  key={`${dept.slug}-${i}`}
                  href={`/category/${dept.slug}`}
                  className={`group/tile border-border relative ${TILE_WIDTH} aspect-[4/3] shrink-0 overflow-hidden rounded-xl border shadow-sm transition-all hover:shadow-lg`}
                >
                  <Image
                    src={image}
                    alt=""
                    fill
                    sizes="240px"
                    className="object-cover transition-transform duration-300 group-hover/tile:scale-105"
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
                key={`${dept.slug}-${i}`}
                href={`/category/${dept.slug}`}
                className={`group/tile border-border bg-card hover:border-brand/30 ${TILE_WIDTH} aspect-[4/3] shrink-0 flex flex-col items-center justify-center gap-2 rounded-xl border p-4 text-center transition-all hover:shadow-md`}
              >
                <span className="bg-brand/10 text-brand flex size-12 items-center justify-center rounded-full transition-transform group-hover/tile:scale-110">
                  <Icon className="size-6" strokeWidth={1.5} />
                </span>
                <span className="text-xs leading-tight font-medium sm:text-sm">{dept.name}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
