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
import { getNavigableCategoryTree } from "@/lib/queries/categories";
import { DEPARTMENT_ICON_MAP } from "@/lib/department-icons";

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

/**
 * Every department, in one row, directly under the hero.
 *
 * Replaces a marquee of stock photographs of kitchens that scrolled by on
 * its own. Two findings behind the change: shoppers underestimate what a
 * shop sells unless its front page shows the breadth of it, and a strip
 * that moves on its own is the one homepage element users reliably fail to
 * use. This one holds still, names each department in words, and gives a
 * phone a row it can flick through.
 */
export async function DepartmentChips() {
  const departments = await getNavigableCategoryTree();
  if (departments.length === 0) return null;

  return (
    <nav aria-label="מחלקות" className="border-border border-b">
      <ul className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none] sm:flex-wrap sm:justify-center sm:py-4 [&::-webkit-scrollbar]:hidden">
        {departments.map((dept) => {
          const Icon = ICONS[DEPARTMENT_ICON_MAP[dept.slug]] ?? Package;
          return (
            <li key={dept.slug} className="shrink-0">
              <Link
                href={`/category/${dept.slug}`}
                className="border-border bg-card hover:border-brand/50 hover:text-brand flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium whitespace-nowrap transition-colors"
              >
                <Icon className="text-brand size-4" strokeWidth={1.75} />
                {dept.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
