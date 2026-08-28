import Link from "next/link";
import { AlertTriangle, Phone } from "lucide-react";
import { getAdminOrders, getAdminOrderStatusCounts, getStaffUsers } from "@/lib/queries/admin-orders";
import { OrdersFilterBar } from "@/components/admin/orders-filter-bar";
import { OrdersStatusTabs } from "@/components/admin/orders-status-tabs";
import { OrderStatusSelect } from "@/components/admin/order-status-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination, PaginationContent, PaginationItem, PaginationLink } from "@/components/ui/pagination";
import {
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_COLORS,
  type OrderStatus,
  type PaymentStatus,
} from "@/lib/enums";
import { formatPrice, formatDateTime } from "@/lib/format";

export const metadata = { title: "הזמנות | A&I Electronics Admin" };

const PAGE_SIZE = 20;

/** "לפני 3 שעות" / "לפני יומיים" — how long this order has been where it is. */
function ageLabel(hoursInStatus: number) {
  const hours = Math.floor(hoursInStatus);
  if (hours < 1) return "עכשיו";
  if (hours < 24) return `לפני ${hours} שעות`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "לפני יום";
  if (days === 2) return "לפני יומיים";
  return `לפני ${days} ימים`;
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  const status = (sp.status as OrderStatus) ?? "ALL";

  const [{ orders, total }, staff, { counts, total: grandTotal }] = await Promise.all([
    getAdminOrders({
      search: sp.search,
      status,
      assignedToId: sp.assignedToId,
      dateFrom: sp.dateFrom,
      dateTo: sp.dateTo,
      page,
      pageSize: PAGE_SIZE,
    }),
    getStaffUsers(),
    getAdminOrderStatusCounts(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function hrefWith(changes: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...sp, ...changes })) {
      if (key === "page" || !value) continue;
      params.set(key, value);
    }
    const qs = params.toString();
    return `/admin/orders${qs ? `?${qs}` : ""}`;
  }

  function pageHref(p: number) {
    const base = hrefWith({});
    if (p <= 1) return base;
    return `${base}${base.includes("?") ? "&" : "?"}page=${p}`;
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">הזמנות</h1>
        <span className="text-muted-foreground text-sm">{total} הזמנות בתצוגה</span>
      </div>

      <OrdersStatusTabs
        counts={counts}
        total={grandTotal}
        active={status}
        buildHref={(s) => hrefWith({ status: s === "ALL" ? undefined : s })}
      />

      <OrdersFilterBar staff={staff} />

      <div className="border-border bg-card overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>מספר הזמנה</TableHead>
              <TableHead>לקוח</TableHead>
              <TableHead>נפתחה</TableHead>
              <TableHead>עודכן</TableHead>
              <TableHead>פריטים</TableHead>
              <TableHead>תשלום</TableHead>
              <TableHead>סכום</TableHead>
              <TableHead>אחראי</TableHead>
              <TableHead className="min-w-[180px]">סטטוס</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-muted-foreground py-10 text-center">
                  לא נמצאו הזמנות תואמות
                </TableCell>
              </TableRow>
            ) : (
              orders.map((order) => {
                const orderStatus = order.status as OrderStatus;
                const phone = order.user?.phone ?? order.guestPhone;

                return (
                  <TableRow key={order.id} className="hover:bg-muted/50">
                    <TableCell>
                      <Link
                        href={`/admin/orders/${order.orderNumber}`}
                        className="text-brand font-medium hover:underline"
                      >
                        {order.orderNumber}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div>{order.user?.name ?? order.guestName ?? "אורח"}</div>
                      {phone && (
                        <a
                          href={`tel:${phone}`}
                          className="text-muted-foreground hover:text-brand flex items-center gap-1 text-xs"
                        >
                          <Phone className="size-3" />
                          {phone}
                        </a>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                      {formatDateTime(order.createdAt)}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {order.isStale ? (
                        <span
                          className="text-destructive flex items-center gap-1 font-medium"
                          title={`ההזמנה לא זזה כבר ${Math.floor(order.hoursInStatus)} שעות`}
                        >
                          <AlertTriangle className="size-3.5" />
                          {ageLabel(order.hoursInStatus)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{ageLabel(order.hoursInStatus)}</span>
                      )}
                    </TableCell>
                    <TableCell>{order.items.length}</TableCell>
                    <TableCell>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          PAYMENT_STATUS_COLORS[order.paymentStatus as PaymentStatus]
                        }`}
                      >
                        {PAYMENT_STATUS_LABELS[order.paymentStatus as PaymentStatus] ?? order.paymentStatus}
                      </span>
                    </TableCell>
                    <TableCell className="font-semibold tabular-nums whitespace-nowrap">
                      {formatPrice(order.total)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{order.assignedTo?.name ?? "—"}</TableCell>
                    <TableCell>
                      {/* Changed here, in the row. Working through a morning's
                          orders used to mean opening each one in turn. */}
                      <OrderStatusSelect orderId={order.id} currentStatus={orderStatus} className="h-8 text-xs" />
                    </TableCell>
                  </TableRow>
                );
              })
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
