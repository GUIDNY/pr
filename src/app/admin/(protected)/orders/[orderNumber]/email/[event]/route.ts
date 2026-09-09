import { requireBackOffice } from "@/lib/auth";
import { previewOrderEmail } from "@/lib/notify";
import { previewOwnerAlert } from "@/lib/notify/owner-alert";
import { NOTIFY_EVENTS, type NotifyEvent } from "@/lib/notify/types";

/**
 * The order email, rendered in a browser tab.
 *
 * A route handler and not a page, because the thing being previewed is a
 * whole HTML document — its own <html>, its own body background — and a page
 * would nest it inside the admin layout, which is the one context that
 * guarantees it does not look like what the customer gets.
 *
 * It renders through the same buildMessage the sender uses, so what shows
 * here is byte-for-byte what leaves.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orderNumber: string; event: string }> },
) {
  try {
    await requireBackOffice();
  } catch {
    return new Response("unauthorized", { status: 403 });
  }

  const { orderNumber, event } = await params;
  /* "owner" is the shop's own new-order alert, which is not a NotifyEvent —
     see owner-alert.ts for why it is kept out of that list. It is previewable
     from the same address because the question is the same one. */
  if (event !== "owner" && !NOTIFY_EVENTS.includes(event as NotifyEvent)) {
    return new Response("unknown event", { status: 404 });
  }

  const html =
    event === "owner"
      ? await previewOwnerAlert(orderNumber)
      : await previewOrderEmail(orderNumber, event as NotifyEvent);
  if (!html) return new Response("order not found", { status: 404 });

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      // A preview of live order data has no business in any cache.
      "cache-control": "no-store",
    },
  });
}
