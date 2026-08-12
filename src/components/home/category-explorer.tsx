import Link from "next/link";
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
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {CATEGORY_TREE.map((dept) => {
          const Icon = ICONS[dept.icon] ?? Package;
          return (
            <Link
              key={dept.slug}
              href={`/category/${dept.slug}`}
              className="group border-border bg-card hover:border-brand/30 flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-all hover:shadow-md"
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
