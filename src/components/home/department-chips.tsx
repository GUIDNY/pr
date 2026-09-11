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
 * Every department as a chip in one scrollable row — the phone's version
 * of the vertical department menu that sits beside the banner on a
 * desktop (DepartmentMenu). Holds still, names each department in words,
 * and is the first thing under the header, so the breadth of the shop is
 * read before anything else.
 */
export async function DepartmentChips() {
  const departments = await getNavigableCategoryTree();
  if (departments.length === 0) return null;

  return (
    <nav aria-label="מחלקות" className="-mx-4 mb-3">
      <ul className="flex gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
