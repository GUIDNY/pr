import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { adsDateTime, conversionRow, pendingConversionWhere } from "@/lib/analytics/google-ads-conversions";

/**
 * The paid orders that came from a Google Ads click, as the file Google Ads'
 * scheduled upload ("Conversions → Uploads → Schedule → HTTPS") fetches
 * itself. The second of the two paths in lib/analytics/google-ads-conversions.ts,
 * and the one that needs no developer token.
 *
 * Behind HTTP basic auth — user `buytoday`, password GOOGLE_ADS_FEED_PASSWORD,
 * the same pair typed into the schedule. Off (404) until that is set. Every
 * order of the last 90 days is listed on every fetch: Google drops a row it
 * has already imported (same click, action and Order ID), so re-listing is
 * how a fetch that failed yesterday is made up today.
 *
 * Under /feeds/ and not /api/, for the reason the Merchant feed is: robots.txt
 * disallows /api.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorised(request: Request, password: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Basic ")) return false;
  const given = Buffer.from(`${Buffer.from(header.slice(6), "base64").toString("utf8")}`);
  const expected = Buffer.from(`buytoday:${password}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: Request) {
  const password = process.env.GOOGLE_ADS_FEED_PASSWORD;
  if (!password) return new Response("Not found", { status: 404 });
  if (!authorised(request, password)) {
    return new Response("Unauthorized", { status: 401, headers: { "www-authenticate": 'Basic realm="conversions"' } });
  }

  const name = process.env.GOOGLE_ADS_CONVERSION_NAME || "רכישה";
  const orders = await db.order.findMany({
    where: pendingConversionWhere(),
    select: { gclid: true, createdAt: true, total: true, orderNumber: true },
    orderBy: { createdAt: "asc" },
  });

  const lines = [
    "Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency,Order ID",
    /* TEMPORARY — remove once the Data Manager connection is complete.
       Google's Data Manager will not finish connecting a source that has
       headers and no data row ("Failed to determine the data type or schema
       of the data source"), and on 12 November no order carried a gclid yet.
       This row only shows Google the shape of the columns: the click id names
       no click, so Google rejects it as "Invalid click ID" and records no
       conversion. Agreed with the owner, on the condition that it comes out
       as soon as the connection is made and that nothing was counted. */
    ["SETUP-TEST-NOT-A-CLICK", name, adsDateTime(new Date()), 1, "ILS", "SETUP-TEST"].map(csvCell).join(","),
    ...orders.map((o) => {
      const r = conversionRow({ ...o, gclid: o.gclid! });
      return [r.gclid, name, r.conversionDateTime, r.conversionValue, r.currencyCode, r.orderId].map(csvCell).join(",");
    }),
  ];
  return new Response(`${lines.join("\n")}\n`, {
    headers: { "content-type": "text/csv; charset=utf-8", "cache-control": "no-store" },
  });
}
