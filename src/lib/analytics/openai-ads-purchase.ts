import "server-only";
import { db } from "@/lib/db";
import { SITE_URL } from "@/lib/site-url";
import { OPENAI_ADS_EVENTS_URL, openAiPurchaseEvent } from "./openai-ads-event";

/**
 * Report a paid order to OpenAI Ads from the server.
 *
 * Called beside sendPurchaseToGa4, at the same two moments: the gateway
 * confirming a charge, and a salesperson capturing a held one. This is the
 * report that clears the Ads Manager warning "No recent server-to-server
 * events", and the only one that can carry the customer's identifiers —
 * the browser's pixel tag lives in GTM and the dataLayer never holds an
 * email or a phone number, on purpose (every tag in the container could
 * read it). Hashing them here, from the order, keeps them out of the browser
 * entirely.
 *
 * ONLY WITH CONSENT. Unlike the GA4 report, which counts the sale
 * unattributed when the visitor said no, this one is sent only for an order
 * whose browser accepted measurement. A hashed address is still the
 * customer's, and lib/consent.ts is the rule that nothing goes to an ad
 * platform about someone who declined. The record of that answer on the
 * order is `gaClientId`, written at checkout only after consent. It errs
 * one way: a visitor who consented while their ad blocker ate GA4's cookie
 * leaves no client id, and is not reported — the cheap direction to be
 * wrong in.
 *
 * Silent when OPENAI_ADS_API_KEY or OPENAI_ADS_PIXEL_ID is unset, and never
 * throws: a report is not worth a failed payment path. No once-only column:
 * OpenAI keeps the first event per pixel, type and id and ignores the rest,
 * so a repeat is harmless, and the browser's copy is deduplicated the same
 * way.
 */
export async function sendPurchaseToOpenAiAds(orderId: string): Promise<void> {
  const apiKey = process.env.OPENAI_ADS_API_KEY;
  const pixelId = process.env.OPENAI_ADS_PIXEL_ID;
  if (!apiKey || !pixelId) return;

  try {
    const order = await db.order.findUnique({
      where: { id: orderId },
      select: {
        orderNumber: true,
        subtotal: true,
        discountTotal: true,
        gaClientId: true,
        guestEmail: true,
        guestPhone: true,
        userId: true,
        user: { select: { email: true, phone: true } },
        items: { select: { skuSnap: true, titleSnap: true, priceSnap: true, quantity: true } },
      },
    });
    if (!order || !order.gaClientId) return;

    const event = openAiPurchaseEvent(
      {
        orderNumber: order.orderNumber,
        subtotal: order.subtotal,
        discountTotal: order.discountTotal ?? 0,
        email: order.user?.email ?? order.guestEmail,
        phone: order.guestPhone ?? order.user?.phone ?? null,
        userId: order.userId,
        items: order.items.map((i) => ({
          sku: i.skuSnap,
          title: i.titleSnap,
          price: i.priceSnap,
          quantity: i.quantity,
        })),
      },
      SITE_URL,
      Date.now(),
    );

    const res = await fetch(`${OPENAI_ADS_EVENTS_URL}?pid=${encodeURIComponent(pixelId)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ integration_source: "buytoday-server", events: [event] }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error(`[openai-ads] ${order.orderNumber}: ${res.status} ${(await res.text()).slice(0, 300)}`);
    }
  } catch (err) {
    console.error("[openai-ads] purchase report failed:", err instanceof Error ? err.message : err);
  }
}
