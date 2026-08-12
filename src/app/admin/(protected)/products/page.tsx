import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { getAdminProducts } from "@/lib/queries/admin-products";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Pagination, PaginationContent, PaginationItem, PaginationLink } from "@/components/ui/pagination";
import { StockBadge } from "@/components/product/stock-badge";
import { formatPrice } from "@/lib/format";
import type { StockStatus } from "@/lib/enums";

export const metadata = { title: "מוצרים | PREC Admin" };

const PAGE_SIZE = 25;

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  const { products, total } = await getAdminProducts({ search: sp.search, page, pageSize: PAGE_SIZE });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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

      <form className="relative mb-4 max-w-sm">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2" />
        <Input name="search" defaultValue={sp.search} placeholder="חיפוש לפי שם, מק&quot;ט או דגם" className="ps-9" />
      </form>

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
                <PaginationLink href={`/admin/products?page=${p}${sp.search ? `&search=${sp.search}` : ""}`} isActive={p === page}>
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
