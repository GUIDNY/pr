import Link from "next/link";
import { Package, Heart, MapPin, ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, type OrderStatus } from "@/lib/enums";
import { formatPrice, formatDate } from "@/lib/format";

export default async function AccountDashboardPage() {
  const session = await getSession();
  if (!session) return null;

  const [orderCount, favoriteCount, addressCount, recentOrders] = await Promise.all([
    db.order.count({ where: { userId: session.sub } }),
    db.favorite.count({ where: { userId: session.sub } }),
    db.address.count({ where: { userId: session.sub } }),
    db.order.findMany({ where: { userId: session.sub }, orderBy: { createdAt: "desc" }, take: 3 }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">שלום, {session.name.split(" ")[0]}</h1>
        <p className="text-muted-foreground mt-1 text-sm">ברוכים הבאים לאזור האישי שלכם</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Link href="/account/orders" className="border-border hover:border-brand/40 rounded-xl border p-4 text-center transition-colors">
          <Package className="text-brand mx-auto mb-2 size-6" />
          <p className="text-xl font-bold">{orderCount}</p>
          <p className="text-muted-foreground text-xs">הזמנות</p>
        </Link>
        <Link href="/account/favorites" className="border-border hover:border-brand/40 rounded-xl border p-4 text-center transition-colors">
          <Heart className="text-brand mx-auto mb-2 size-6" />
          <p className="text-xl font-bold">{favoriteCount}</p>
          <p className="text-muted-foreground text-xs">מועדפים</p>
        </Link>
        <Link href="/account/addresses" className="border-border hover:border-brand/40 rounded-xl border p-4 text-center transition-colors">
          <MapPin className="text-brand mx-auto mb-2 size-6" />
          <p className="text-xl font-bold">{addressCount}</p>
          <p className="text-muted-foreground text-xs">כתובות</p>
        </Link>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">הזמנות אחרונות</h2>
          <Link href="/account/orders" className="text-brand flex items-center gap-1 text-sm hover:underline">
            כל ההזמנות <ArrowLeft className="size-3.5" />
          </Link>
        </div>
        {recentOrders.length === 0 ? (
          <p className="text-muted-foreground border-border rounded-xl border p-6 text-center text-sm">עדיין לא ביצעתם הזמנות.</p>
        ) : (
          <ul className="divide-border border-border divide-y rounded-xl border">
            {recentOrders.map((order) => (
              <li key={order.id}>
                <Link href={`/account/orders/${order.orderNumber}`} className="hover:bg-muted flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium">{order.orderNumber}</p>
                    <p className="text-muted-foreground text-xs">{formatDate(order.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${ORDER_STATUS_COLORS[order.status as OrderStatus]}`}>
                      {ORDER_STATUS_LABELS[order.status as OrderStatus]}
                    </span>
                    <span className="font-semibold tabular-nums">{formatPrice(order.total)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
