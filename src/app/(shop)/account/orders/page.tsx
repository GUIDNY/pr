import Link from "next/link";
import { Package } from "lucide-react";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, type OrderStatus } from "@/lib/enums";
import { formatPrice, formatDate } from "@/lib/format";

export const metadata = { title: "ההזמנות שלי" };

export default async function AccountOrdersPage() {
  const session = await getSession();
  if (!session) return null;

  const orders = await db.order.findMany({
    where: { userId: session.sub },
    include: { items: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">ההזמנות שלי</h1>

      {orders.length === 0 ? (
        <div className="border-border flex flex-col items-center gap-3 rounded-xl border p-12 text-center">
          <Package className="text-muted-foreground/40 size-12" strokeWidth={1} />
          <p className="text-muted-foreground text-sm">עדיין לא ביצעתם הזמנות</p>
          <Link href="/" className="text-brand text-sm font-medium hover:underline">
            התחילו לקנות
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {orders.map((order) => (
            <li key={order.id}>
              <Link href={`/account/orders/${order.orderNumber}`} className="border-border hover:border-brand/30 block rounded-xl border p-4 transition-colors">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{order.orderNumber}</p>
                    <p className="text-muted-foreground text-xs">
                      {formatDate(order.createdAt)} · {order.items.length} פריטים
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${ORDER_STATUS_COLORS[order.status as OrderStatus]}`}>
                      {ORDER_STATUS_LABELS[order.status as OrderStatus]}
                    </span>
                    <span className="font-semibold tabular-nums">{formatPrice(order.total)}</span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
