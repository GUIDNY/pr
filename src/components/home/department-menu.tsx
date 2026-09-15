import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { DepartmentIcon } from "@/components/home/department-icon";
import type { DepartmentCount } from "@/lib/queries/categories";

/**
 * The vertical department list beside the homepage banner — the shape
 * every established Israeli electronics retailer opens on, and for a
 * reason: a visitor who has never heard of the shop reads the whole
 * range in one glance, with a number beside each line that says the
 * range is real. Desktop only; on a phone the same departments run as a
 * scrollable row of round photo tiles above the banner (CategoryCircles).
 */
export function DepartmentMenu({ departments }: { departments: DepartmentCount[] }) {
  return (
    <nav aria-label="מחלקות" className="border-border bg-card hidden overflow-hidden rounded-2xl border lg:block">
      <p className="border-border text-muted-foreground border-b px-4 py-2.5 text-xs font-semibold tracking-wide">
        כל המחלקות
      </p>
      <ul className="py-1">
        {departments.map((d) => {
          return (
            <li key={d.slug}>
              <Link
                href={`/category/${d.slug}`}
                className="group hover:bg-muted hover:text-brand flex items-center gap-3 px-3 py-1 text-sm font-medium transition-colors"
              >
                <DepartmentIcon slug={d.slug} />
                <span className="min-w-0 flex-1 truncate">{d.name}</span>
                <span className="text-muted-foreground/60 text-[11px] tabular-nums">{d.count.toLocaleString("he-IL")}</span>
                <ChevronLeft className="text-muted-foreground size-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
