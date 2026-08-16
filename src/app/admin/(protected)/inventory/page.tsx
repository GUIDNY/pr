import Link from "next/link";
import {
  Boxes,
  CheckCircle2,
  PackageX,
  AlertTriangle,
  Truck,
  Eye,
  ShieldAlert,
  ArrowUpRight,
} from "lucide-react";
import {
  getInventorySummary,
  getInventoryProducts,
  getInventoryFilterOptions,
  type InventoryTableFilters,
} from "@/lib/queries/admin-inventory";
import { InventoryFilterBar } from "@/components/admin/inventory-filter-bar";
import { InventoryTabs } from "@/components/admin/inventory-tabs";
import { InventorySyncButton } from "@/components/admin/inventory-sync-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination, PaginationContent, PaginationItem, PaginationLink } from "@/components/ui/pagination";
import { StockBadge } from "@/components/product/stock-badge";
import { formatPrice, formatDateTime } from "@/lib/format";
import type { StockStatus } from "@/lib/enums";

export const metadata = { title: "מרכז בקרת מלאי | PREC Admin" };

const PAGE_SIZE = 30;

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
    sort: (sp.sort as InventoryTableFilters["sort"]) ?? "updated",
    page,
    pageSize: PAGE_SIZE,
  };

  const [summary, { products, total }, filterOptions] = await Promise.all([
    getInventorySummary(),
    getInventoryProducts(filters),
    getInventoryFilterOptions(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function pageHref(p: number) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(sp)) {
      if (key === "page" || !value) continue;
      params.set(key, value);
    }
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return `/admin/inventory${qs ? `?${qs}` : ""}`;
  }

  const tiles = [
    { label: "סה״כ מוצרים", value: summary.totalProducts, icon: Boxes },
    { label: "במלאי", value: summary.inStock, icon: CheckCircle2 },
    { label: "אזלו", value: summary.outOfStock, icon: PackageX },
    { label: "מלאי נמוך", value: summary.lowStock, icon: AlertTriangle },
    { label: "מלאי ספק", value: summary.supplierStock, icon: Truck },
    { label: "תצוגה בלבד", value: summary.displayOnly, icon: Eye },
    { label: "דורש בדיקה", value: summary.needsReview, icon: ShieldAlert },
    { label: "השתנו היום", value: summary.changedToday, icon: ArrowUpRight },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">מרכז בקרת מלאי</h1>
          {summary.latestRun && (
            <p className="text-muted-foreground mt-1 text-sm">
              סנכרון אחרון: {formatDateTime(summary.latestRun.startedAt)}
              {summary.productsAddedLastSync > 0 && ` • ${summary.productsAddedLastSync} מוצרים חדשים`}
              {summary.productsMissingLastSync > 0 && ` • ${summary.productsMissingLastSync} נעלמו מהמקור`}
            </p>
          )}
        </div>
        <InventorySyncButton />
      </div>

      <InventoryTabs />

      {summary.unresolvedAlerts > 0 && (
        <Link
          href="/admin/inventory/alerts"
          className="border-warning/40 bg-warning/10 text-warning-foreground mb-4 flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium hover:opacity-90"
        >
          <AlertTriangle className="size-4 shrink-0" />
          {summary.unresolvedAlerts} מוצרים דורשים תשומת לב
        </Link>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {tiles.map((t) => (
          <div key={t.label} className="border-border bg-card rounded-xl border p-3.5">
            <t.icon className="text-brand mb-2 size-4" />
            <p className="text-lg font-bold tabular-nums">{t.value.toLocaleString("he-IL")}</p>
            <p className="text-muted-foreground text-xs leading-tight">{t.label}</p>
          </div>
        ))}
      </div>

      <InventoryFilterBar
        brands={filterOptions.brands}
        sources={filterOptions.sources.map((s) => ({ id: s.id, filename: s.filename }))}
        categories={filterOptions.categories}
      />

      <div className="text-muted-foreground mb-2 text-sm">{total.toLocaleString("he-IL")} מוצרים תואמים</div>

      <div className="border-border bg-card overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>מוצר</TableHead>
              <TableHead>מק&quot;ט</TableHead>
              <TableHead>מותג</TableHead>
              <TableHead>קטגוריה</TableHead>
              <TableHead>מחיר</TableHead>
              <TableHead>מחיר קודם</TableHead>
              <TableHead>מלאי</TableHead>
              <TableHead>זמינות</TableHead>
              <TableHead>מקור</TableHead>
              <TableHead>סונכרן</TableHead>
              <TableHead>פרסום</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-muted-foreground py-10 text-center">
                  לא נמצאו מוצרים תואמים
                </TableCell>
              </TableRow>
            ) : (
              products.map((p) => (
                <TableRow key={p.id} className="hover:bg-muted/50">
                  <TableCell className="max-w-[220px]">
                    <Link href={`/admin/inventory/${p.id}`} className="text-brand line-clamp-2 font-medium hover:underline">
                      {p.title}
                    </Link>
                    {p.sourceSheet && <div className="text-muted-foreground text-xs">{p.sourceSheet}</div>}
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">{p.sku}</TableCell>
                  <TableCell className="text-sm">{p.brand.name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{p.category.name}</TableCell>
                  <TableCell className="font-semibold tabular-nums">{formatPrice(p.price)}</TableCell>
                  <TableCell className="text-muted-foreground text-sm tabular-nums">
                    {p.compareAtPrice ? formatPrice(p.compareAtPrice) : "—"}
                  </TableCell>
                  <TableCell className="tabular-nums">{p.stockQty}</TableCell>
                  <TableCell>
                    <StockBadge status={p.stockStatus as StockStatus} />
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-[140px] truncate text-xs">
                    {p.source?.filename ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {p.lastExcelSyncAt ? formatDateTime(p.lastExcelSyncAt) : "—"}
                  </TableCell>
                  <TableCell>
                    <span
                      className={
                        p.isPublished
                          ? "bg-success/15 text-success rounded-full px-2 py-0.5 text-xs font-medium"
                          : "bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs font-medium"
                      }
                    >
                      {p.isPublished ? "מפורסם" : "לא מפורסם"}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

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
    </div>
  );
}
