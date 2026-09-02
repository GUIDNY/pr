import { pelecardConfig } from "@/lib/pelecard/config";
import { pelecardCheckoutCss } from "@/lib/pelecard/checkout-css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The stylesheet Pelecard's payment page loads, handed to them as `CssURL` at
 * init.
 *
 * The address matters more than the file. Pelecard ignore `CssURL` unless the
 * exact URL has been whitelisted by their support, and the page silently falls
 * back to its default — so the URL is a thing to be registered once and then
 * never changed. That is why this is a route at a fixed public path rather than
 * a file in /public: the address stays put while the design keeps moving, and
 * the base sheet it imports can follow whichever gateway is configured instead
 * of being a hard-coded host that outlives the switch to production.
 *
 * Public on purpose: their servers and their customers' browsers have to be
 * able to fetch it, and it is a stylesheet, so there is nothing here to leak.
 * It must also stay outside any Vercel deployment protection, or Pelecard get
 * a login page where they expected CSS.
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
