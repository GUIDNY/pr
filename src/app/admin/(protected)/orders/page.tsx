import Link from "next/link";
import { Trash2 } from "lucide-react";
import { getAdminOrders, getAdminOrderStatusCounts, getStaffUsers } from "@/lib/queries/admin-orders";
import { OrdersFilterBar } from "@/components/admin/orders-filter-bar";
import { OrdersStatusTabs } from "@/components/admin/orders-status-tabs";
import { AdminOrdersTable } from "@/components/admin/admin-orders-table";
import { Pagination, PaginationContent, PaginationItem, PaginationLink } from "@/components/ui/pagination";
import { type OrderStatus } from "@/lib/enums";
import { requireBackOffice } from "@/lib/auth";
import { canManageCatalog } from "@/lib/permissions";
import { getSellerOrdersByStage, getSellerStageCounts } from "@/lib/queries/seller-orders";
import { OrdersBulkList } from "@/components/admin/orders-bulk-list";
import { OrderStageTabs } from "@/components/admin/order-stage-tabs";
import { isStage, STAGE_HINTS, TRASH_STAGE } from "@/lib/order-stage";

export const metadata = { title: "הזמנות | Buy Today Admin" };

const PAGE_SIZE = 20;

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  /* Two different pages behind one address, and the address is the reason.
     A salesperson and a manager both mean "the orders" when they say it, and
     giving the seller /admin/seller-orders would put a second URL for the
     same thing into every link, bookmark and revalidatePath in the app. What
     differs is what each of them needs to see, so that is what branches. */
  const session = await requireBackOffice();
  if (!canManageCatalog(session.role)) {
    const sp = await searchParams;
    const stage = isStage(sp.stage) ? sp.stage : "open";
    const [orders, counts] = await Promise.all([
      getSellerOrdersByStage(stage),
      getSellerStageCounts(),
    ]);
    return (
      <div className="flex flex-col gap-4">
        <OrderStageTabs active={stage} counts={counts} />
        <p className="text-muted-foreground text-sm">{STAGE_HINTS[stage]}</p>
        {orders.length === 0 ? (
          <p className="text-muted-foreground border-border rounded-xl border border-dashed p-8 text-center text-sm">
            {stage === TRASH_STAGE ? "הפח ריק." : "אין כאן הזמנות כרגע."}
          </p>
        ) : (
          <OrdersBulkList orders={orders} stage={stage} />
        )}
      </div>
    );
  }

  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  const status = (sp.status as OrderStatus) ?? "ALL";
  /* The bin is its own view rather than a thirteenth status chip: it cuts
     across all of them, and an order in it is not in a status that anybody
     is working. Its own parameter, so the status filter still means what it
     says while you are in there. */
  const bin = sp.bin === "1";

  const [{ orders, total }, staff, { counts, total: grandTotal, binned }] = await Promise.all([
    getAdminOrders({
      search: sp.search,
      status,
      assignedToId: sp.assignedToId,
      dateFrom: sp.dateFrom,
      dateTo: sp.dateTo,
      page,
      pageSize: PAGE_SIZE,
      bin,
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
        <h1 className="text-2xl font-bold">{bin ? "פח ההזמנות" : "הזמנות"}</h1>
        <span className="text-muted-foreground text-sm">{total} הזמנות בתצוגה</span>
      </div>

      {bin ? (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Link
            href="/admin/orders"
            className="border-border hover:bg-muted rounded-full border px-3 py-1.5 text-sm font-medium"
          >
            ← חזרה להזמנות
          </Link>
          <p className="text-muted-foreground text-sm">
            הוצאו מהתור ולא נמחקו. אפשר לשחזר, או למחוק מכאן לצמיתות.
          </p>
        </div>
      ) : (
        <>
          <OrdersStatusTabs
            counts={counts}
            total={grandTotal}
            active={status}
            buildHref={(s) => hrefWith({ status: s === "ALL" ? undefined : s })}
          />
          <OrdersFilterBar staff={staff} />
        </>
      )}

      <AdminOrdersTable orders={orders} bin={bin} />

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

      {!bin && binned > 0 && (
        <Link
          href="/admin/orders?bin=1"
          className="text-muted-foreground hover:text-foreground mt-6 flex w-fit items-center gap-1.5 text-sm font-semibold"
        >
          <Trash2 className="size-4" />
          פח ({binned})
        </Link>
      )}
    </div>
  );
}
