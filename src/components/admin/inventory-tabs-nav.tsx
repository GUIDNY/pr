"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Six tabs. Five were set by the owner on 11 October; the sixth is his too.
 *
 * There were ten. "כל המוצרים" answered where a SKU is, and the other nine
 * were every other thing the catalogue can be asked, each equally
 * prominent — competitor images beside sync history beside alerts. Nobody
 * opens this page to browse a menu; they open it because something is
 * wrong, and ten tabs is a page with no answer to that.
 *
 * So: all the products, and then the four things that are actually wrong,
 * in the order they get dealt with. The ninth question is still a URL — the
 * pages below were not deleted, and the tools line keeps the ones with a
 * button on them reachable — it just stopped competing for the attention of
 * somebody trying to find out what broke.
 */
const TABS = [
  { href: "/admin/inventory", label: "כל המוצרים", exact: true },
  /* Added 12 October, and it is the only tab here that is not a problem
     list. Every other one answers "what is wrong"; this answers "what are
     we selling", which had no page at all — the summary bar's 1,624 and the
     shop's 1,225 could only be reconciled by asking someone to measure it. */
  { href: "/admin/inventory/live", label: "מוצרים באתר" },
  { href: "/admin/inventory/new", label: "מוצרים חדשים מהסנכרון" },
  { href: "/admin/inventory/price-gaps", label: "בעיית מחיר" },
  { href: "/admin/inventory/no-image", label: "ללא תמונה" },
  /* Renamed 12 October, from "מוצרים בעייתיים". The old name described a
     list of faults somebody had nominated; the page now accounts for every
     product in stock that no customer can buy, which is a different and
     bigger question — and the one that was actually being asked. */
  { href: "/admin/inventory/problems", label: "למה לא באתר" },
  /* Added 14 October, at the owner's request, after a 04:30 run moved a
     price overnight and finding out which one took a database query. The
     two pages that looked like they answered it do not: סנכרון history
     gives a run's counters with nothing under them, and שינויים gives every
     event ever in one flat list — and 1,114 of that run's 1,148 events were
     PRODUCT_DATA_CHANGED, which is the sheet disagreeing with an enriched
     title and is logged on every run for every enriched product. The eight
     price moves were on page three. */
  { href: "/admin/inventory/sync-changes", label: "מה השתנה בסנכרון" },
];

/* Not tabs. Two of these are the only way to press a button that exists
   nowhere else — the image migration, and the source list — so dropping
   them from the strip without leaving a door would have made a job in
   flight unreachable. Kept deliberately quiet. */
const TOOLS = [
  { href: "/admin/inventory/urgent", label: "טיפול" },
  { href: "/admin/inventory/enrichment", label: "העשרת מוצרים" },
  { href: "/admin/inventory/changes", label: "שינויים" },
  { href: "/admin/inventory/history", label: "היסטוריית סנכרון" },
  { href: "/admin/inventory/alerts", label: "התראות" },
  { href: "/admin/inventory/sources", label: "מקורות", ownerOnly: true },
  { href: "/admin/inventory/image-migration", label: "העברת תמונות", ownerOnly: true },
  { href: "/admin/inventory/competitor-images", label: "תמונות ממתחרים", ownerOnly: true },
];

export function InventoryTabsNav({ owner = false }: { owner?: boolean }) {
  const pathname = usePathname();
  return (
    <div className="mb-6">
      <div className="border-border flex gap-1 overflow-x-auto border-b">
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
      <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {TOOLS.filter((t) => !t.ownerOnly || owner).map((tool) => (
          <Link
            key={tool.href}
            href={tool.href}
            className={cn(
              "hover:text-foreground transition-colors",
              pathname.startsWith(tool.href) && "text-foreground font-semibold"
            )}
          >
            {tool.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
