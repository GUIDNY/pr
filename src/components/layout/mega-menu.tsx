"use client";

import { useRef, useState } from "react";
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
import { cn } from "@/lib/utils";

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

export function MegaMenu() {
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleClose() {
    closeTimer.current = setTimeout(() => setOpenSlug(null), 150);
  }
  function cancelClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }

  const openDept = CATEGORY_TREE.find((d) => d.slug === openSlug);

  return (
    <nav
      className="border-border relative border-t hidden lg:block"
      onMouseLeave={scheduleClose}
    >
      <ul className="mx-auto flex max-w-7xl items-center gap-1 px-4">
        {CATEGORY_TREE.map((dept) => {
          const Icon = ICONS[dept.icon] ?? Package;
          const isOpen = openSlug === dept.slug;
          return (
            <li key={dept.slug} onMouseEnter={() => (cancelClose(), setOpenSlug(dept.slug))}>
              <Link
                href={`/category/${dept.slug}`}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors",
                  isOpen ? "text-brand" : "hover:text-brand"
                )}
              >
                <Icon className="size-4" />
                {dept.name}
              </Link>
            </li>
          );
        })}
      </ul>

      {openDept && (
        <div
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          className="bg-popover text-popover-foreground absolute inset-x-0 top-full z-40 border-b shadow-lg"
        >
          <div className="mx-auto grid max-w-7xl grid-cols-4 gap-6 px-6 py-6">
            <div className="col-span-3 grid grid-cols-3 gap-x-6 gap-y-2">
              {openDept.children.map((child) => (
                <Link
                  key={child.slug}
                  href={`/category/${child.slug}`}
                  onClick={() => setOpenSlug(null)}
                  className="hover:text-brand hover:bg-muted rounded-md px-2 py-1.5 text-sm transition-colors"
                >
                  {child.name}
                </Link>
              ))}
            </div>
            <div className="border-border bg-muted/50 flex flex-col justify-between rounded-lg border p-4">
              {(() => {
                const Icon = ICONS[openDept.icon] ?? Package;
                return <Icon className="text-brand size-8" strokeWidth={1.5} />;
              })()}
              <div>
                <p className="mt-3 text-sm font-semibold">כל המוצרים ב{openDept.name}</p>
                <Link
                  href={`/category/${openDept.slug}`}
                  onClick={() => setOpenSlug(null)}
                  className="text-brand mt-1 inline-block text-sm font-medium hover:underline"
                >
                  לצפייה בכל הקטגוריה ←
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
