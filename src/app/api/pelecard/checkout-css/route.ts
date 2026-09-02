import { pelecardConfig } from "@/lib/pelecard/config";
import { pelecardCheckoutCss } from "@/lib/pelecard/checkout-css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The stylesheet Pelecard's payment page loads, handed to them as `CssURL` at
 * init.
 *
 * A route rather than a file in /public because it imports the configured
 * gateway's own sheet as its base, and that host has to follow the
 * configuration — a hard-coded one here would be the single string still
 * pointing at the test server on the day of the switch.
 *
 * Public on purpose: their servers and their customers' browsers have to be
 * able to fetch it, and it is a stylesheet, so there is nothing here to leak.
 */
export async function GET() {
  let baseUrl: string;
  try {
    ({ baseUrl } = pelecardConfig());
  } catch {
    // Payments are misconfigured, which is a problem for the payment routes to
    // report. A stylesheet should still answer with a stylesheet.
    return new Response("/* pelecard gateway is not configured */", {
      status: 200,
      headers: { "content-type": "text/css; charset=utf-8" },
    });
  }

  return new Response(pelecardCheckoutCss(baseUrl), {
    headers: {
      "content-type": "text/css; charset=utf-8",
      // Short, so a design change is visible on the next payment rather than
      // after a cache expires somewhere we cannot reach.
      "cache-control": "public, max-age=60, s-maxage=60",
    },
  });
}
