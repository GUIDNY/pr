"use client";

import Script from "next/script";
import { Suspense, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useConsent } from "@/lib/consent";

/**
 * The Meta pixel base code, or nothing at all.
 *
 * Gated on NEXT_PUBLIC_META_PIXEL_ID exactly as GoogleAnalytics is gated on
 * NEXT_PUBLIC_GA_ID, and for a sharper reason than analytics had: this dataset
 * is what ad spend is optimised against. A preview deployment firing Purchase
 * events into it does not merely add noise to a report, it teaches the ad
 * platform to bid on people who bought nothing. With no id set, no Facebook
 * script is fetched and no request leaves the browser.
 *
 * The id being set is necessary and not sufficient. Nothing here renders
 * until a visitor has actually agreed — see lib/consent.ts, and the banner in
 * components/layout/cookie-notice.tsx that was rewritten from an
 * acknowledgement into a real gate for exactly this script.
 *
 * afterInteractive for the same reason as the analytics tag: a measurement
 * script has nothing to do before the page is usable, and the caching work
 * this shipped alongside exists to stop making a visitor wait on things that
 * are not the page.
 */
export function MetaPixel() {
  const id = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  // Consent first, and consent means BEFORE the script is fetched. An
  // unanswered banner and a refusal both render nothing at all — see
  // lib/consent.ts for why "load it and switch it off" is not the same thing.
  const consent = useConsent();
  if (!id || consent !== "granted") return null;

  return (
    <>
      {/*
        Meta's own snippet, with one deliberate change: it ends with
        `fbq('track','PageView')` and this does not. In the App Router a
        navigation is a client-side render and the document never reloads, so
        the snippet's single PageView would report the entry page and then
        nothing for the rest of the visit. Every view is sent from PageViews
        below instead, including the first.

        Inline and in the server HTML rather than through next/script, so it
        is in the source Meta's own installer check reads, and so the queue
        exists before any event elsewhere on the page tries to use it — fbq
        buffers calls made before the library finishes loading, but only once
        this stub has defined it.
      */}
      <script
        dangerouslySetInnerHTML={{
          __html: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[]}(window,document);fbq('init','${id}');`,
        }}
      />
      <Script
        id="meta-pixel-lib"
        src="https://connect.facebook.net/en_US/fbevents.js"
        strategy="afterInteractive"
      />
      {/*
        The no-JS fallback from Meta's snippet. It only renders when scripts
        are off, so it can never double-count against the PageView below.
      */}
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          alt=""
          src={`https://www.facebook.com/tr?id=${id}&ev=PageView&noscript=1`}
        />
      </noscript>
      {/*
        useSearchParams reads the URL on the client, and a component doing that
        outside a Suspense boundary opts its whole route out of static
        rendering. Same boundary, same reason, as GoogleAnalytics.
      */}
      <Suspense fallback={null}>
        <PageViews />
      </Suspense>
    </>
  );
}

/** One PageView per page, including the first. */
function PageViews() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    const query = searchParams.toString();
    const path = query ? `${pathname}?${query}` : pathname;
    // React may run an effect twice in development, and a replaced search
    // param can re-run it with an unchanged URL. Neither is a page view.
    if (lastSent.current === path) return;
    lastSent.current = path;
    window.fbq?.("track", "PageView");
  }, [pathname, searchParams]);

  return null;
}
