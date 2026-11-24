import "server-only";
import { db } from "@/lib/db";
import { META_CAPI_VERSION, META_PIXEL_FALLBACK_ID, buildCapiPurchase } from "@/lib/analytics/meta-capi-payload";

/**
 * Tell Meta about a paid order from the server (Conversions API).
 *
 * The browser's pixel reaches only the visitors who accepted cookies and
 * whose browser let it load. This is the same Purchase, sent when the order
 * is captured, with event_id = the order number so Meta merges it with the
 * pixel's own event instead of counting two.
 *
 * Consent: an order is reported only when `metaConsent` is true — the
 * visitor's answer to the cookie banner at checkout. No answer, or a refusal,
 * sends nothing at all. Personal details (hashed email and phone) and the
 * browser ids fbp/fbc ride along only in that case.
 *
 * Silent when META_CAPI_TOKEN is unset, and never throws: a report is not
 * worth a failed payment path. A failure is kept on the order (metaCapiError)
 * like adsConversionError; metaCapiSentAt is the once-only guard, written
 * only after Meta answered 2xx. META_CAPI_TEST_CODE routes events to Events
 * Manager → Test events instead of the live stream. The token is never
 * logged.
 */
export async function sendPurchaseToMetaCapi(orderId: string): Promise<void> {
  const token = process.env.META_CAPI_TOKEN;
  if (!token) return;
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID || META_PIXEL_FALLBACK_ID;

  try {
    const order = await db.order.findUnique({
      where: { id: orderId },
      select: {
        orderNumber: true,
        total: true,
        createdAt: true,
        metaConsent: true,
        metaFbp: true,
        metaFbc: true,
        metaCapiSentAt: true,
        guestEmail: true,
        guestPhone: true,
        items: { select: { skuSnap: true, quantity: true } },
      },
    });
    if (!order || order.metaCapiSentAt || !order.metaConsent) return;

    const body: Record<string, unknown> = { data: [buildCapiPurchase(order)] };
    const testCode = process.env.META_CAPI_TEST_CODE;
    if (testCode) body.test_event_code = testCode;

    const res = await fetch(`https://graph.facebook.com/${META_CAPI_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).replaceAll(token, "[token]").slice(0, 400);
      console.error("[meta-capi] purchase not accepted", { orderNumber: order.orderNumber, status: res.status });
      await db.order.update({
        where: { id: orderId },
        data: { metaCapiAttempts: { increment: 1 }, metaCapiError: `${res.status} ${detail}`.slice(0, 500) },
      });
      return;
    }
    await db.order.update({
      where: { id: orderId },
      data: { metaCapiSentAt: new Date(), metaCapiAttempts: { increment: 1 }, metaCapiError: null },
    });
  } catch (error) {
    console.error("[meta-capi] purchase send failed", { orderId, error: error instanceof Error ? error.name : "error" });
  }
}
