"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/inventory", label: "כל המוצרים", exact: true },
  { href: "/admin/inventory/urgent", label: "טיפול", exact: true },
  { href: "/admin/inventory/urgent-critical", label: "טיפול דחוף" },
  { href: "/admin/inventory/changes", label: "שינויים אחרונים" },
  { href: "/admin/inventory/history", label: "היסטוריית סנכרון" },
  { href: "/admin/inventory/alerts", label: "התראות" },
  { href: "/admin/inventory/enrichment", label: "העשרת מוצרים" },
  { href: "/admin/inventory/sources", label: "מקורות נתונים" },
];

export function InventoryTabs() {
  const pathname = usePathname();
  return (
    <div className="border-border mb-6 flex gap-1 overflow-x-auto border-b">
      {TABS.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "border-brand text-brand"
                : "text-muted-foreground hover:text-foreground border-transparent"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
