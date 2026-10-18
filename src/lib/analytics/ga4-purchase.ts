import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";

/**
 * Tell GA4 about a paid order from the server.
 *
 * The browser's purchase event fires only for a visitor who agreed to be
 * measured, so GA4's revenue undercounted by exactly the share who did not.
 * The Measurement Protocol sends the same event from here, once per order,
 * with no client identity at all: the client_id is a hash of the order
 * number, which identifies the order to GA4 and nothing else. GA4 will
 * therefore not tie the purchase to a session — that is the point — but it
 * will count the money.
 *
 * Silent when GA4_API_SECRET or NEXT_PUBLIC_GA_ID is unset, and never
 * throws: a report is not worth a failed payment path. ga4PurchaseSentAt is
 * the once-only guard, written only after Google answered 2xx.
 */
export async function sendPurchaseToGa4(orderId: string): Promise<void> {
  const measurementId = process.env.NEXT_PUBLIC_GA_ID;
  const apiSecret = process.env.GA4_API_SECRET;
  if (!measurementId || !apiSecret) return;

  try {
    const order = await db.order.findUnique({
      where: { id: orderId },
      select: {
        orderNumber: true,
        total: true,
        deliveryFee: true,
        couponCode: true,
        ga4PurchaseSentAt: true,
        items: { select: { skuSnap: true, titleSnap: true, priceSnap: true, quantity: true } },
      },
    });
    if (!order || order.ga4PurchaseSentAt) return;

    const clientId = createHash("sha256").update(`ga4:${order.orderNumber}`).digest("hex").slice(0, 32);
    const payload = {
      client_id: clientId,
      non_personalized_ads: true,
      events: [
        {
          name: "purchase",
          params: {
            transaction_id: order.orderNumber,
            value: Number(order.total.toFixed(2)),
            currency: "ILS",
            shipping: Number(order.deliveryFee.toFixed(2)),
            ...(order.couponCode ? { coupon: order.couponCode } : {}),
            items: order.items.map((i) => ({
              item_id: i.skuSnap,
              item_name: i.titleSnap.slice(0, 100),
              price: Number(i.priceSnap.toFixed(2)),
              quantity: i.quantity,
            })),
          },
        },
      ],
    };

    const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      console.error("[ga4] purchase not accepted", { orderNumber: order.orderNumber, status: res.status });
      return;
    }
    await db.order.update({ where: { id: orderId }, data: { ga4PurchaseSentAt: new Date() } });
  } catch (error) {
    console.error("[ga4] purchase send failed", { orderId, error });
  }
}
