import { requireCatalogPage } from "@/lib/auth";
import {
  getInventorySummary,
  getInventoryProducts,
  getInventoryFilterOptions,
  getSheetSummaryCards,
  type InventoryTableFilters,
} from "@/lib/queries/admin-inventory";
import { InventoryFilterBar } from "@/components/admin/inventory-filter-bar";
import { InventoryTabs } from "@/components/admin/inventory-tabs";
import { InventorySyncButton } from "@/components/admin/inventory-sync-button";
import { InventorySummaryBar } from "@/components/admin/inventory-summary-bar";
import { InventorySheetTabs } from "@/components/admin/inventory-sheet-tabs";
import { InventoryTable } from "@/components/admin/inventory-table";
import { InventoryProductDrawer } from "@/components/admin/inventory-product-drawer";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { formatDateTime } from "@/lib/format";
import { checkSyncFreshness } from "@/lib/inventory/sync-watchdog";
import type { StockStatus } from "@/lib/enums";

export const metadata = { title: "מרכז המלאי | Buy Today Admin" };

const PAGE_SIZE = 30;

function timeAgo(date: Date) {
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "הרגע";
  if (mins < 60) return `לפני ${mins} דקות`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `לפני ${hours} שעות`;
  return formatDateTime(date);
}

export default async function AdminInventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireCatalogPage();
  const sp = await searchParams;
  const page = Number(sp.page) || 1;

  const filters: InventoryTableFilters = {
    search: sp.search,
    categorySlug: sp.categorySlug,
    brandId: sp.brandId,
    status: (sp.status as StockStatus) ?? "ALL",
    sourceId: sp.sourceId,
    sourceSheet: sp.sourceSheet,
    publishStatus: (sp.publishStatus as "PUBLISHED" | "UNPUBLISHED") ?? "ALL",
    alertType: sp.alertType,
    hasTemporarySku: sp.hasTemporarySku === "1",
    view: (sp.view as InventoryTableFilters["view"]) ?? "ALL",
    sort: (sp.sort as InventoryTableFilters["sort"]) ?? "updated",
    page,
    pageSize: PAGE_SIZE,
  };

  const [summary, { products, total }, filterOptions, sheetCards, freshness] = await Promise.all([
    getInventorySummary(),
    getInventoryProducts(filters),
    getInventoryFilterOptions(),
    getSheetSummaryCards(sp.sourceId),
    /* The same function the watchdog raises SYNC_STALE from, rather than a
       second reading of the same timestamps — the one thing worse than no
       indicator here would be one that disagrees with the alert. */
    checkSyncFreshness(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function pageHref(p: number) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(sp)) {
      if (key === "page" || key === "product" || !value) continue;
      params.set(key, value);
    }
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return `/admin/inventory${qs ? `?${qs}` : ""}`;
  }

  const activeSources = filterOptions.sources.filter((s) => s.isActive);
  const activeSourcesCount = activeSources.length;

  /* Worded from the missed runs and not from the hours, so that it says the
     same thing as the alert: the agent reports at 07:30 and 15:30, and a
     firing that lands while the office file server is off was never a
     chance to report. The hours are printed anyway once it is late, because
     "2 ריצות" is the fault and "26 שעות" is what it has cost. */
  const hours = freshness.hoursSince === null ? null : Math.floor(freshness.hoursSince);
  const contact = !freshness.lastSeenAt
    ? { text: "לא נבדק מעולם", tone: "text-destructive font-semibold" }
    : freshness.stale
      ? {
          text: `לא דווח כבר ${hours} שעות (${freshness.missedReports} ריצות)`,
          tone: "text-destructive font-semibold",
        }
      : freshness.lagging
        ? { text: `ריצה אחת לא התקיימה · נבדק ${timeAgo(freshness.lastSeenAt)}`, tone: "text-warning-foreground font-semibold" }
        : { text: `נבדק ${timeAgo(freshness.lastSeenAt)}`, tone: "" };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">מרכז המלאי</h1>
          <p className="text-muted-foreground mt-1 text-sm">ניהול מוצרים, מלאי, מחירים וסנכרון מקורות הנתונים</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {summary.latestRun && (
            <p className="text-muted-foreground text-xs">
              סונכרן {timeAgo(summary.latestRun.startedAt)} ·{" "}
              {/* Two different facts, and conflating them is what cost a
                  working day. "סונכרן" is the last run that imported
                  something, and it stands still for as long as the supplier
                  sends the same file — correctly. "נבדק" is the last time
                  the machine in the office read the sheets and reached this
                  server at all, changed or not, and that one should move
                  twice a day no matter what the supplier does. A screen
                  showing only the first looks identical on a quiet Sunday
                  and on a Thursday when the office Mac has stopped, which
                  is exactly the morning somebody sells against two-day-old
                  stock. */}
              <span className={contact.tone}>{contact.text}</span> · {activeSourcesCount} מקורות נתונים מחוברים
            </p>
          )}
          <div className="flex items-center gap-2">
            {/* A plain anchor and not a Link: this is a file download, and
                Next's client router would try to navigate to it. */}
            <a
              href="/api/inventory/price-export"
              className="border-border hover:bg-muted rounded-lg border px-3 py-2 text-sm font-semibold"
            >
              ייצוא מחירים (Excel)
            </a>
            <InventorySyncButton />
          </div>
        </div>
      </div>

      <InventoryTabs />

      <InventorySummaryBar
        totalProducts={summary.totalProducts}
        sellable={summary.sellable}
        sources={activeSources.map((s) => ({ id: s.id, filename: s.filename }))}
      />

      <InventorySheetTabs sheets={sheetCards} />

      <InventoryFilterBar
        brands={filterOptions.brands}
        sources={filterOptions.sources.map((s) => ({ id: s.id, filename: s.filename }))}
        categories={filterOptions.categories}
      />

      <div className="text-muted-foreground mb-2 text-sm">{total.toLocaleString("he-IL")} מוצרים תואמים</div>

      <InventoryTable products={products} />

      <AdminPagination page={page} totalPages={totalPages} href={pageHref} />

      <InventoryProductDrawer />
    </div>
  );
}
