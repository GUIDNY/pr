"use client";

import { useEffect } from "react";
import { ATTRIBUTION_COOKIE, ATTRIBUTION_COOKIE_DAYS, parseAttribution, type Attribution, type AttributionTouch } from "@/lib/attribution";

/**
 * Writes the bt_attr cookie — see lib/attribution.ts for what it holds.
 *
 * In the browser and not in the middleware, on purpose. The middleware runs
 * only on the routes that need it and the home page is served from the CDN
 * without touching a function; a cookie set from the browser costs nothing
 * on the server and works on every page, cached or not. The cookie is
 * readable by scripts for the same reason — the browser is what writes it —
 * and holds nothing worth protecting.
 *
 * Runs once per page load. A navigation inside the site does not change
 * where the visit came from, and the referrer of an internal navigation is
 * this site, which is excluded anyway.
 */

const OWN_HOSTS = ["buytoday.co.il", "pr-ayam.vercel.app", "localhost"];

const SEARCH_ENGINES: [RegExp, string][] = [
  [/(^|\.)google\./, "google"],
  [/(^|\.)bing\.com$/, "bing"],
  [/(^|\.)duckduckgo\.com$/, "duckduckgo"],
  [/(^|\.)yahoo\./, "yahoo"],
];

const SOCIAL: [RegExp, string][] = [
  [/(^|\.)facebook\.com$|(^|\.)fb\.com$|^l\.facebook\.com$|^lm\.facebook\.com$|^m\.facebook\.com$/, "facebook"],
  [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)whatsapp\.com$|^wa\.me$/, "whatsapp"],
  [/(^|\.)tiktok\.com$/, "tiktok"],
  [/(^|\.)youtube\.com$|^youtu\.be$/, "youtube"],
  [/(^|\.)twitter\.com$|^t\.co$|(^|\.)x\.com$/, "twitter"],
  [/(^|\.)telegram\.org$|^t\.me$/, "telegram"],
];

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isOwn(host: string): boolean {
  return OWN_HOSTS.some((own) => host === own || host.endsWith(`.${own}`));
}

/** What this page load says about where the visitor came from, or null
    when it says nothing new (an internal navigation, a reload). */
function touchFromPage(): AttributionTouch | null {
  const params = new URLSearchParams(window.location.search);
  const referrerHost = document.referrer ? hostOf(document.referrer) : null;
  const landing = (window.location.pathname + window.location.search).slice(0, 300);
  const at = new Date().toISOString();
  const trim = (v: string | null) => (v ? v.trim().slice(0, 120) : undefined);

  const utmSource = trim(params.get("utm_source"));
  if (utmSource) {
    return {
      source: utmSource.toLowerCase().slice(0, 80),
      medium: (trim(params.get("utm_medium")) ?? "(none)").toLowerCase().slice(0, 80),
      campaign: trim(params.get("utm_campaign")),
      content: trim(params.get("utm_content")),
      term: trim(params.get("utm_term")),
      referrer: referrerHost ?? undefined,
      landing,
      at,
    };
  }
  /* The click ids the ad networks append when the link had no utm. */
  if (params.has("gclid") || params.has("gbraid") || params.has("wbraid")) {
    return { source: "google", medium: "cpc", referrer: referrerHost ?? undefined, landing, at };
  }
  if (params.has("fbclid")) {
    const source = referrerHost && /instagram/.test(referrerHost) ? "instagram" : "facebook";
    return { source, medium: "paid-social", referrer: referrerHost ?? undefined, landing, at };
  }
  if (params.has("ttclid")) {
    return { source: "tiktok", medium: "paid-social", referrer: referrerHost ?? undefined, landing, at };
  }

  if (referrerHost && !isOwn(referrerHost)) {
    for (const [re, name] of SEARCH_ENGINES) if (re.test(referrerHost)) return { source: name, medium: "organic", referrer: referrerHost, landing, at };
    for (const [re, name] of SOCIAL) if (re.test(referrerHost)) return { source: name, medium: "social", referrer: referrerHost, landing, at };
    if (/zap\.co\.il$/.test(referrerHost)) return { source: "zap", medium: "referral", referrer: referrerHost, landing, at };
    return { source: referrerHost.replace(/^www\./, ""), medium: "referral", referrer: referrerHost, landing, at };
  }
  if (referrerHost && isOwn(referrerHost)) return null;

  /* No referrer and no parameters: typed, bookmarked, or an app that strips
     the referrer. Only worth recording as the first touch. */
  return { source: "direct", medium: "(none)", landing, at };
}

function readCookie(): Attribution | null {
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${ATTRIBUTION_COOKIE}=`));
  return parseAttribution(match ? match.slice(ATTRIBUTION_COOKIE.length + 1) : null);
}

function writeCookie(value: Attribution) {
  const encoded = encodeURIComponent(JSON.stringify(value));
  if (encoded.length > 3500) return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${ATTRIBUTION_COOKIE}=${encoded}; Max-Age=${ATTRIBUTION_COOKIE_DAYS * 86400}; Path=/; SameSite=Lax${secure}`;
}

export function AttributionCapture() {
  useEffect(() => {
    try {
      const touch = touchFromPage();
      if (!touch) return;
      const existing = readCookie();
      if (!existing) {
        writeCookie({ first: touch });
        return;
      }
      /* A later arrival from somewhere real replaces the last touch. A
         direct visit does not: typing the address after a campaign click is
         still the campaign's sale. */
      if (touch.source !== "direct") writeCookie({ first: existing.first, last: touch });
    } catch {
      /* A cookie that cannot be written is not a problem the visitor should
         ever see. */
    }
  }, []);
  return null;
}
