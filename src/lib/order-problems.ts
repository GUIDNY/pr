/**
 * What is wrong with an order, as the back office shows it.
 *
 * Two severities, and the difference is what a `block` costs: it disables
 * "נמסר ללקוח — סגור" on the order page. So a block has to be something
 * that genuinely must be settled before the order can be finished, and
 * nothing else.
 *
 * STOCK IS A PICKING CONCERN, AND IT STOPS AT THE WAREHOUSE DOOR.
 *
 * The shelf is read now rather than from the order, which is right while
 * somebody still has to find the thing and put it in a van: "ordered 1,
 * stock 0" is then a real problem and a real phone call to the supplier.
 *
 * It is nonsense the moment the order has shipped. PR-430724 is a Blomberg
 * dryer that left on 26 August; the shelf says 0 **because that dryer is
 * the one that left**. The order was paid, picked, packed, shipped and
 * delivered, and the back office refused to let anybody close it — the one
 * button that finishes an order, disabled for ever, by a warning about
 * stock the order itself consumed.
 *
 * It is not a one-off either: every order that sells the last unit of
 * something ends up here. Two of the three orders carrying this block when
 * it was found had already shipped.
 *
 * So the stock checks are asked only of an order that still has to be
 * picked. After it has gone — or been cancelled, where nobody is picking
 * anything either — the shelf says nothing about it.
 */

export type OrderProblem = { severity: "block" | "warn"; text: string };

export type ProblemInput = {
  status: string;
  deliveryMethod: string;
  shippedAt: Date | null;
  address: string;
  phone: string | null;
  items: { titleSnap: string; quantity: number; product: { stockQty: number } | null }[];
};

/**
 * Is anybody still going to take these goods off a shelf?
 *
 * `shippedAt` first, because it is the fact rather than a label: an order
 * marked DELIVERED straight from PROCESSING never passes through SHIPPED,
 * and an order can be moved backwards by the undo button while the goods
 * are long gone.
 */
export function stillToBePicked(order: { status: string; shippedAt: Date | null }): boolean {
  if (order.shippedAt) return false;
  return !["SHIPPED", "DELIVERED", "CANCELLED", "REFUND_PENDING", "REFUNDED"].includes(order.status);
}

export function orderProblems(order: ProblemInput): OrderProblem[] {
  const problems: OrderProblem[] = [];
  const toCustomer = order.deliveryMethod === "DELIVERY";

  /* A delivery order with nowhere to deliver it. This used to reach the
     back office silently — see the shipCity comment in schema.prisma —
     which is why the address is on the front of the card and not below
     the fold. Still a block after shipping: an order that went out with
     no recorded address is a thing somebody has to fix, not a thing time
     makes true. */
  if (toCustomer && !order.address) {
    problems.push({ severity: "block", text: "הזמנת משלוח בלי כתובת — צריך להתקשר ללקוח" });
  }
  if (!order.phone) {
    problems.push({ severity: "block", text: "אין טלפון ליצירת קשר" });
  }

  if (stillToBePicked(order)) {
    for (const item of order.items) {
      const inStock = item.product ? item.product.stockQty : null;
      if (inStock === null) {
        problems.push({ severity: "warn", text: `${item.titleSnap} — המוצר לא קיים יותר בקטלוג` });
      } else if (inStock < item.quantity) {
        problems.push({
          severity: "block",
          text: `${item.titleSnap} — הוזמנו ${item.quantity}, במלאי ${inStock}`,
        });
      }
    }
  }

  return problems;
}
