import {
  getInventorySummary,
  getInventoryProducts,
  getInventoryFilterOptions,
  getAttentionGroups,
  type InventoryTableFilters,
} from "@/lib/queries/admin-inventory";
import { InventoryFilterBar } from "@/components/admin/inventory-filter-bar";
import { InventoryTabs } from "@/components/admin/inventory-tabs";
import { InventoryViewTabs } from "@/components/admin/inventory-view-tabs";
import { InventorySyncButton } from "@/components/admin/inventory-sync-button";
import { InventoryKpiCards } from "@/components/admin/inventory-kpi-cards";
import { InventoryAttentionCenter } from "@/components/admin/inventory-attention-center";
import { InventoryTable } from "@/components/admin/inventory-table";
import { InventoryProductDrawer } from "@/components/admin/inventory-product-drawer";
import { Pagination, PaginationContent, PaginationItem, PaginationLink } from "@/components/ui/pagination";
import { formatDateTime } from "@/lib/format";
import type { StockStatus } from "@/lib/enums";

export const metadata = { title: "מרכז המלאי | PREC Admin" };

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
  const sp = await searchParams;
  const page = Number(sp.page) || 1;

  const filters: InventoryTableFilters = {
    search: sp.search,
    categorySlug: sp.categorySlug,
    brandId: sp.brandId,
    status: (sp.status as StockStatus) ?? "ALL",
    sourceId: sp.sourceId,
    publishStatus: (sp.publishStatus as "PUBLISHED" | "UNPUBLISHED") ?? "ALL",
    alertType: sp.alertType,
    view: (sp.view as InventoryTableFilters["view"]) ?? "ALL",
    sort: (sp.sort as InventoryTableFilters["sort"]) ?? "updated",
    page,
    pageSize: PAGE_SIZE,
  };

  const [summary, { products, total }, filterOptions, attentionGroups] = await Promise.all([
    getInventorySummary(),
    getInventoryProducts(filters),
    getInventoryFilterOptions(),
    getAttentionGroups(),
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

  const activeSourcesCount = filterOptions.sources.filter((s) => s.isActive).length;

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
              סונכרן {timeAgo(summary.latestRun.startedAt)} · {activeSourcesCount} מקורות נתונים מחוברים
            </p>
          )}
          <InventorySyncButton />
        </div>
      </div>

      <InventoryTabs />

      <InventoryKpiCards
        totalProducts={summary.totalProducts}
        lowStock={summary.lowStock}
        needsAttention={summary.unresolvedAlerts}
        changedToday={summary.changedToday}
        activeView={sp.view}
      />

      <InventoryAttentionCenter groups={attentionGroups} />

      <InventoryViewTabs />
      <InventoryFilterBar
        brands={filterOptions.brands}
        sources={filterOptions.sources.map((s) => ({ id: s.id, filename: s.filename }))}
        categories={filterOptions.categories}
      />

      <div className="text-muted-foreground mb-2 text-sm">{total.toLocaleString("he-IL")} מוצרים תואמים</div>

      <InventoryTable products={products} />

      {totalPages > 1 && (
        <Pagination className="mt-6">
          <PaginationContent>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
              .map((p, idx, arr) => (
                <PaginationItem key={p}>
                  {idx > 0 && arr[idx - 1] !== p - 1 && <span className="text-muted-foreground px-1">…</span>}
                  <PaginationLink href={pageHref(p)} isActive={p === page}>
                    {p}
                  </PaginationLink>
                </PaginationItem>
              ))}
          </PaginationContent>
        </Pagination>
      )}

      <InventoryProductDrawer />
    </div>
  );
}
