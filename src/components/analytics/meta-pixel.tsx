"use client";

import Script from "next/script";
import { Suspense, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

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
 * A note for whoever switches it on: the cookie banner in
 * components/layout/cookie-notice.tsx is an acknowledgement, not a consent
 * manager — its own comment says so, and says that an advertising script is
 * exactly the case it is the wrong shape for. That is a decision for the shop's
 * owner, not something this file can settle, which is another reason the id
 * lives in an environment variable that a person sets deliberately.
 *
 * afterInteractive for the same reason as the analytics tag: a measurement
 * script has nothing to do before the page is usable, and the caching work
 * this shipped alongside exists to stop making a visitor wait on things that
 * are not the page.
 */
export function MetaPixel() {
  const id = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  if (!id) return null;

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
