"use client";

import Script from "next/script";
import { useConsent } from "@/lib/consent";
import { useIsNativeApp } from "@/lib/native-app";

/**
 * Google Tag Manager — container GTM-5Z82SD4Z, which carries the GA4 tag and
 * the five ecommerce event tags (see lib/analytics/ga.ts).
 *
 * Loaded on the same terms as GoogleAnalytics, Clarity and the pixel:
 * after consent, never before, and never inside the iOS app. The brief's
 * snippet installs the container unconditionally in the root layout; here
 * that would put a third-party tag on the page of someone who has not
 * answered the banner, which is the thing lib/consent.ts exists to
 * prevent. So the component renders nothing until the answer is yes, and
 * the <noscript> iframe from the snippet is left out on purpose — it
 * cannot know about consent, and would load the container for every
 * scripts-off visitor regardless.
 *
 * Consent Mode v2 is set in the same breath: defaults denied, then an
 * update to granted, both before gtm.js is fetched. It looks redundant
 * next to "do not load until yes", and it is the honest wiring — the tags
 * inside the container read the consent signal, and a container loaded
 * without one assumes granted silently.
 *
 * While the direct gtag install (google-analytics.tsx) is still present,
 * GA4 runs twice and page_view doubles; the brief wants it that way until
 * GTM is verified in DebugView, then the direct install goes.
 */
export function GoogleTagManager() {
  const id = process.env.NEXT_PUBLIC_GTM_ID;
  const consent = useConsent();
  const inApp = useIsNativeApp();
  if (!id || inApp || consent !== "granted") return null;

  prepareDataLayer();
  return <Script id="gtm" src={`https://www.googletagmanager.com/gtm.js?id=${id}`} strategy="afterInteractive" />;
}

let prepared = false;
function prepareDataLayer() {
  if (prepared) return;
  prepared = true;
  window.dataLayer = window.dataLayer || [];
  /* gtag() is "push the arguments object"; GTM's consent handling reads
     exactly that shape, so the two consent calls go in as arguments
     objects rather than plain records. */
  // eslint-disable-next-line prefer-rest-params
  const gtag = function () { window.dataLayer!.push(arguments); } as (...args: unknown[]) => void;
  gtag("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "denied",
    wait_for_update: 500,
  });
  gtag("consent", "update", {
    ad_storage: "granted",
    ad_user_data: "granted",
    ad_personalization: "granted",
    analytics_storage: "granted",
  });
  window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
}
