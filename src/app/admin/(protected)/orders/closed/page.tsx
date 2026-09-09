import { getSellerOrders } from "@/lib/queries/seller-orders";
import { SellerOrderCard } from "@/components/admin/seller-order-card";
import { requireBackOffice } from "@/lib/auth";

export const metadata = { title: "הזמנות סגורות | Buy Today" };

/**
 * Orders nobody is coming back to: delivered, cancelled, refunded.
 *
 * A static segment beside [orderNumber], which resolves ahead of it in the
 * router. Safe because an order number is "PR-######" and can never be the
 * word "closed" — but it is the kind of thing that is safe until somebody
 * changes the numbering, so it is worth saying here.
 */
export default async function ClosedOrdersPage() {
  await requireBackOffice();
  const orders = await getSellerOrders(true);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-black">הזמנות סגורות</h1>
        <p className="text-muted-foreground text-sm">
          {orders.length === 0 ? "אין עדיין הזמנות סגורות." : `${orders.length} הזמנות`}
        </p>
      </div>
      <div className="flex flex-col gap-3">
        {orders.map((order) => (
          <SellerOrderCard key={order.id} order={order} closed />
        ))}
      </div>
    </div>
  );
}
