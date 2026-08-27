import Link from "next/link";
import { Plus, Search, PackageCheck, PackageX, Boxes } from "lucide-react";
import { getAdminProducts, getStockSummary } from "@/lib/queries/admin-products";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Pagination, PaginationContent, PaginationItem, PaginationLink } from "@/components/ui/pagination";
import { StockBadge } from "@/components/product/stock-badge";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { StockStatus } from "@/lib/enums";

export const metadata = { title: "מוצרים | A&I Electronics Admin" };

const PAGE_SIZE = 25;

type Availability = "IN_STOCK" | "OUT_OF_STOCK" | undefined;
type Sort = "updated" | "stock_asc" | "stock_desc";

function buildHref(sp: Record<string, string | undefined>, overrides: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  // Any filter/sort change resets to page 1 unless the override explicitly
  // sets a page (that's how pagination links themselves use this).
  const base = "page" in overrides ? sp : { ...sp, page: undefined };
  const merged = { ...base, ...overrides };
  for (const [key, value] of Object.entries(merged)) {
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  return `/admin/products${qs ? `?${qs}` : ""}`;
}

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  const availability = (sp.availability as Availability) ?? undefined;
  const sort = (sp.sort as Sort) ?? "updated";

  const [{ products, total }, summary] = await Promise.all([
    getAdminProducts({ search: sp.search, availability, sort, page, pageSize: PAGE_SIZE }),
    getStockSummary(),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const tabs: { key: Availability; label: string; count: number }[] = [
    { key: undefined, label: "הכל", count: summary.total },
    { key: "IN_STOCK", label: "במלאי", count: summary.inStock },
    { key: "OUT_OF_STOCK", label: "לא במלאי", count: summary.outOfStock },
  ];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">מוצרים</h1>
        <Button variant="brand" size="sm" asChild className="gap-1.5">
          <Link href="/admin/products/new">
            <Plus className="size-4" /> מוצר חדש
          </Link>
        </Button>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="border-border bg-card rounded-xl border p-4">
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <Boxes className="size-3.5" /> סה&quot;כ מוצרים
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{summary.total}</div>
        </div>
        <div className="border-border bg-card rounded-xl border p-4">
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <PackageCheck className="text-success size-3.5" /> במלאי
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{summary.inStock}</div>
        </div>
        <div className="border-border bg-card rounded-xl border p-4">
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <PackageX className="text-destructive size-3.5" /> לא במלאי
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{summary.outOfStock}</div>
        </div>
        <div className="border-border bg-card rounded-xl border p-4">
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <Boxes className="size-3.5" /> סה&quot;כ יחידות במלאי
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{summary.totalUnits}</div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          {tabs.map((tab) => (
            <Link
              key={tab.label}
              href={buildHref(sp, { availability: tab.key })}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                availability === tab.key
                  ? "bg-brand text-brand-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              )}
            >
              {tab.label} <span className="tabular-nums opacity-70">({tab.count})</span>
            </Link>
          ))}
        </div>

        <form className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2" />
          {availability && <input type="hidden" name="availability" value={availability} />}
          {sort !== "updated" && <input type="hidden" name="sort" value={sort} />}
          <Input name="search" defaultValue={sp.search} placeholder="חיפוש לפי שם, מק&quot;ט או דגם" className="ps-9 sm:w-64" />
        </form>
      </div>

      <div className="mb-4 flex items-center gap-1 text-sm">
        <span className="text-muted-foreground">מיון:</span>
        <Link href={buildHref(sp, { sort: undefined })} className={cn("rounded-md px-2 py-1", sort === "updated" ? "bg-muted font-medium" : "text-muted-foreground hover:underline")}>
          עודכן לאחרונה
        </Link>
        <Link href={buildHref(sp, { sort: "stock_asc" })} className={cn("rounded-md px-2 py-1", sort === "stock_asc" ? "bg-muted font-medium" : "text-muted-foreground hover:underline")}>
          מלאי: נמוך לגבוה
        </Link>
        <Link href={buildHref(sp, { sort: "stock_desc" })} className={cn("rounded-md px-2 py-1", sort === "stock_desc" ? "bg-muted font-medium" : "text-muted-foreground hover:underline")}>
          מלאי: גבוה לנמוך
        </Link>
      </div>

      <div className="border-border bg-card overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>מוצר</TableHead>
              <TableHead>מק&quot;ט</TableHead>
              <TableHead>קטגוריה</TableHead>
              <TableHead>מחיר</TableHead>
              <TableHead>מלאי</TableHead>
              <TableHead>סטטוס</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground py-10 text-center">
                  לא נמצאו מוצרים
                </TableCell>
              </TableRow>
            ) : (
              products.map((p) => (
                <TableRow key={p.id} className="hover:bg-muted/50">
                  <TableCell>
                    <Link href={`/admin/products/${p.id}`} className="text-brand font-medium hover:underline">
                      {p.title}
                    </Link>
                    <p className="text-muted-foreground text-xs">{p.brand.name}</p>
                  </TableCell>
                  <TableCell className="text-sm" dir="ltr">
                    {p.sku}
                  </TableCell>
                  <TableCell className="text-sm">{p.category.name}</TableCell>
                  <TableCell className="font-medium tabular-nums">{formatPrice(p.price)}</TableCell>
                  <TableCell className="tabular-nums">{p.stockQty}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <StockBadge status={p.stockStatus as StockStatus} />
                      {!p.isPublished && <span className="text-muted-foreground text-xs">לא פורסם</span>}
                    </div>
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
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <PaginationItem key={p}>
                <PaginationLink href={buildHref(sp, { page: String(p) })} isActive={p === page}>
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
