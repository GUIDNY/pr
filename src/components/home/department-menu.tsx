import Link from "next/link";
import { ChevronLeft, Package, type LucideIcon } from "lucide-react";
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
} from "lucide-react";
import { DEPARTMENT_ICON_MAP } from "@/lib/department-icons";
import type { DepartmentCount } from "@/lib/queries/categories";

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
 * The vertical department list beside the homepage banner — the shape
 * every established Israeli electronics retailer opens on, and for a
 * reason: a visitor who has never heard of the shop reads the whole
 * range in one glance, with a number beside each line that says the
 * range is real. Desktop only; on a phone the same departments run as a
 * scrollable row of chips above the banner (DepartmentChips).
 */
export function DepartmentMenu({ departments }: { departments: DepartmentCount[] }) {
  return (
    <nav aria-label="מחלקות" className="border-border bg-card hidden overflow-hidden rounded-2xl border lg:block">
      <p className="border-border text-muted-foreground border-b px-4 py-2.5 text-xs font-semibold tracking-wide">
        כל המחלקות
      </p>
      <ul className="py-1">
        {departments.map((d) => {
          const Icon = ICONS[DEPARTMENT_ICON_MAP[d.slug]] ?? Package;
          return (
            <li key={d.slug}>
              <Link
                href={`/category/${d.slug}`}
                className="group hover:bg-muted hover:text-brand flex items-center gap-3 px-4 py-2 text-sm font-medium transition-colors"
              >
                <Icon className="text-brand size-4.5 shrink-0" strokeWidth={1.75} />
                <span className="min-w-0 flex-1 truncate">{d.name}</span>
                <span className="text-muted-foreground text-xs tabular-nums">{d.count.toLocaleString("he-IL")}</span>
                <ChevronLeft className="text-muted-foreground size-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
