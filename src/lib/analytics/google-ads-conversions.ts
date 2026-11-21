import "server-only";
import { db } from "@/lib/db";
import { adClickOf, type AdClick } from "@/lib/attribution";

/**
 * Paid orders reported to Google Ads as click conversions, from the server.
 *
 * Shopping learns from conversions, and on 10 November the campaign had
 * received none: 56 clicks, zero conversions, because the only conversion
 * signal was a browser tag, and half the visitors refuse cookies — no `_ga`,
 * no client id, nothing for a tag to send. A click conversion needs none of
 * that. Google gave the visitor a `gclid` when they clicked, the browser kept
 * it in bt_attr (lib/attribution.ts, first-party, no consent involved: it is
 * the shop's own record of where an order came from), the cart and then the
 * order carry it in their own `gclid` column, and from here the sale is
 * handed back to Google keyed on it.
 *
 * Two ways out, because the second needs nothing from Google but a URL:
 *
 *   1. Google Ads API, ConversionUploadService.UploadClickConversions —
 *      `uploadPendingAdsConversions`, run by the cron at
 *      /api/internal/ads-conversions every quarter hour. Off until every
 *      GOOGLE_ADS_* variable below is set; the developer token needs a
 *      manager account and Google's approval, which takes days.
 *   2. A scheduled HTTPS upload that Google Ads fetches itself —
 *      `/feeds/google-ads-conversions.csv`, behind basic auth
 *      (GOOGLE_ADS_FEED_PASSWORD). Works the day it is configured.
 *
 * Both report `orderId` = the order number, which is what stops a sale being
 * counted twice when both paths, or a browser tag as well, report it.
 *
 * Which orders: paid (AUTHORIZED or CAPTURED), not cancelled or refunded,
 * with a Google Ads click id, placed within the 90 days Google accepts. The
 * click id is the gclid column, or — for the iPhone clicks that carry none —
 * the gbraid or wbraid kept on the order's attribution: see adClickOf in
 * lib/attribution.ts and AD_CLICK_CLAUSE below. Never inside the
 * payment request — a slow or failing Google must cost a report, never an
 * order. Each attempt is counted and the last error kept on the order, so a
 * stuck upload is visible rather than silent, and it stops after
 * MAX_ATTEMPTS.
 *
 * The conversion action must be an "Import → clicks" action. A website-tag
 * action refuses uploads — that is the most likely first error, and it is
 * stored on the order verbatim.
 */

export const ADS_CUSTOMER_ID = "1547232645";
const API_VERSION = process.env.GOOGLE_ADS_API_VERSION || "v26";
const MAX_ATTEMPTS = 8;
const LOOKBACK_DAYS = 90;
const PAID = ["AUTHORIZED", "CAPTURED"];
const EXCLUDED_STATUSES = ["CANCELLED", "REFUND_PENDING", "REFUNDED"];

type AdsConfig = {
  developerToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  customerId: string;
  loginCustomerId: string | null;
  conversionActionId: string;
};

export function adsApiConfig(): AdsConfig | null {
  const e = process.env;
  const cfg = {
    developerToken: e.GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
    clientId: e.GOOGLE_ADS_CLIENT_ID ?? "",
    clientSecret: e.GOOGLE_ADS_CLIENT_SECRET ?? "",
    refreshToken: e.GOOGLE_ADS_REFRESH_TOKEN ?? "",
    customerId: (e.GOOGLE_ADS_CUSTOMER_ID || ADS_CUSTOMER_ID).replace(/\D/g, ""),
    loginCustomerId: e.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/\D/g, "") || null,
    conversionActionId: e.GOOGLE_ADS_PURCHASE_ACTION_ID?.replace(/\D/g, "") ?? "",
  };
  const { loginCustomerId: _optional, ...required } = cfg;
  void _optional;
  return Object.values(required).every(Boolean) ? cfg : null;
}

/* Where an order's other two click ids live: on a touch of its attribution
   JSON, never in a column. Listed once, because the where-clause below and
   adClickOf have to agree on where to look. */
const BRAID_PATHS = [
  ["last", "gbraid"],
  ["last", "wbraid"],
  ["first", "gbraid"],
  ["first", "wbraid"],
];

/* "Has a Google Ads click id", asked of the database so that an order with
   none is never fetched: the gclid column, or a gbraid / wbraid string on
   either touch. string_starts_with "" is Prisma's way of saying "there is a
   string at this path" — a missing key, a null and a number all fail it. */
const AD_CLICK_CLAUSE = {
  OR: [
    { gclid: { not: null } },
    ...BRAID_PATHS.map((path) => ({ attribution: { path, string_starts_with: "" } })),
  ],
};

/** Orders that are owed a report. Shared by the API uploader and the feed.
    The click-id condition sits under AND so that a caller spreading this
    next to an OR of its own cannot silently replace it. */
export function pendingConversionWhere(now = new Date()) {
  return {
    AND: [AD_CLICK_CLAUSE],
    paymentStatus: { in: PAID },
    status: { notIn: EXCLUDED_STATUSES },
    createdAt: { gte: new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000) },
  };
}

/**
 * Google's format, "yyyy-MM-dd HH:mm:ss+02:00", in Israel's time with the
 * offset that applied on that date (+02:00 in winter, +03:00 in summer).
 */
export function adsDateTime(date: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jerusalem",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
      timeZoneName: "longOffset",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const offset = (parts.timeZoneName ?? "GMT+02:00").replace("GMT", "") || "+00:00";
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}${offset}`;
}

/** What is sent for one order — the same numbers on both paths. The click
    is spread first, so the row carries exactly one of gclid, gbraid and
    wbraid under the name Google's API uses for it. */
export function conversionRow(order: { click: AdClick; createdAt: Date; total: number; orderNumber: string }) {
  return {
    ...order.click,
    conversionDateTime: adsDateTime(order.createdAt),
    conversionValue: Number(order.total.toFixed(2)),
    currencyCode: "ILS",
    orderId: order.orderNumber,
  };
}

async function accessToken(cfg: AdsConfig): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: cfg.refreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (!res.ok || !json.access_token) throw new Error(`oauth: ${res.status} ${json.error ?? ""}`.trim());
  return json.access_token;
}

export async function uploadPendingAdsConversions(): Promise<{
  configured: boolean;
  pending: number;
  sent: number;
  failed: number;
}> {
  const cfg = adsApiConfig();
  const orders = await db.order.findMany({
    where: { ...pendingConversionWhere(), adsConversionSentAt: null, adsConversionAttempts: { lt: MAX_ATTEMPTS } },
    select: { id: true, gclid: true, attribution: true, createdAt: true, total: true, orderNumber: true },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  if (!cfg) return { configured: false, pending: orders.length, sent: 0, failed: 0 };
  if (orders.length === 0) return { configured: true, pending: 0, sent: 0, failed: 0 };

  let token: string;
  try {
    token = await accessToken(cfg);
  } catch (error) {
    console.error("[google-ads] token", error);
    return { configured: true, pending: orders.length, sent: 0, failed: orders.length };
  }

  const conversionAction = `customers/${cfg.customerId}/conversionActions/${cfg.conversionActionId}`;
  let sent = 0;
  let failed = 0;
  /* One order per request. A batch with partialFailure answers with error
     indexes that have to be mapped back; at a handful of orders a day the
     simple loop is the one whose failures are unambiguous. */
  for (const order of orders) {
    /* The where-clause already promised a click id; this is the same
       question asked of the row that came back, and an order that somehow
       has none is left for the next run rather than sent without one. */
    const click = adClickOf(order.gclid, order.attribution);
    if (!click) continue;
    const row = { ...conversionRow({ ...order, click }), conversionAction };
    let error: string | null = null;
    try {
      const res = await fetch(
        `https://googleads.googleapis.com/${API_VERSION}/customers/${cfg.customerId}:uploadClickConversions`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "developer-token": cfg.developerToken,
            ...(cfg.loginCustomerId ? { "login-customer-id": cfg.loginCustomerId } : {}),
            "content-type": "application/json",
          },
          body: JSON.stringify({ conversions: [row], partialFailure: true }),
          signal: AbortSignal.timeout(15_000),
        },
      );
      const json = (await res.json().catch(() => ({}))) as {
        partialFailureError?: { message?: string };
        error?: { message?: string };
      };
      if (!res.ok) error = `${res.status} ${json.error?.message ?? ""}`.trim();
      else if (json.partialFailureError?.message) error = json.partialFailureError.message;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }

    await db.order.update({
      where: { id: order.id },
      data: error
        ? { adsConversionAttempts: { increment: 1 }, adsConversionError: error.slice(0, 500) }
        : { adsConversionAttempts: { increment: 1 }, adsConversionError: null, adsConversionSentAt: new Date() },
    });
    if (error) {
      failed++;
      console.error("[google-ads] conversion not accepted", { orderNumber: order.orderNumber, error });
    } else sent++;
  }
  return { configured: true, pending: orders.length, sent, failed };
}
