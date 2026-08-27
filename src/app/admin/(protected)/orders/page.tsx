import Link from "next/link";
import { getAdminOrders, getStaffUsers } from "@/lib/queries/admin-orders";
import { OrdersFilterBar } from "@/components/admin/orders-filter-bar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination, PaginationContent, PaginationItem, PaginationLink } from "@/components/ui/pagination";
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, type OrderStatus } from "@/lib/enums";
import { formatPrice, formatDateTime } from "@/lib/format";

export const metadata = { title: "הזמנות | A&I Electronics Admin" };

const PAGE_SIZE = 20;

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const page = Number(sp.page) || 1;

  const [{ orders, total }, staff] = await Promise.all([
    getAdminOrders({
      search: sp.search,
      status: (sp.status as OrderStatus) ?? "ALL",
      assignedToId: sp.assignedToId,
      dateFrom: sp.dateFrom,
      dateTo: sp.dateTo,
      page,
      pageSize: PAGE_SIZE,
    }),
    getStaffUsers(),
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
    return `/admin/orders${qs ? `?${qs}` : ""}`;
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">הזמנות</h1>
        <span className="text-muted-foreground text-sm">{total} הזמנות</span>
      </div>

      <OrdersFilterBar staff={staff} />

      <div className="border-border bg-card overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>מספר הזמנה</TableHead>
              <TableHead>לקוח</TableHead>
              <TableHead>תאריך</TableHead>
              <TableHead>פריטים</TableHead>
              <TableHead>סטטוס</TableHead>
              <TableHead>אחראי</TableHead>
              <TableHead>סכום</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground py-10 text-center">
                  לא נמצאו הזמנות תואמות
                </TableCell>
              </TableRow>
            ) : (
              orders.map((order) => (
                <TableRow key={order.id} className="hover:bg-muted/50">
                  <TableCell>
                    <Link href={`/admin/orders/${order.orderNumber}`} className="text-brand font-medium hover:underline">
                      {order.orderNumber}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div>{order.user?.name ?? order.guestName ?? "אורח"}</div>
                    <div className="text-muted-foreground text-xs">{order.user?.phone ?? order.guestPhone}</div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{formatDateTime(order.createdAt)}</TableCell>
                  <TableCell>{order.items.length}</TableCell>
                  <TableCell>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${ORDER_STATUS_COLORS[order.status as OrderStatus]}`}>
                      {ORDER_STATUS_LABELS[order.status as OrderStatus]}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{order.assignedTo?.name ?? "—"}</TableCell>
                  <TableCell className="font-semibold tabular-nums">{formatPrice(order.total)}</TableCell>
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
