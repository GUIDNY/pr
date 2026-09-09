"use client";

import Script from "next/script";
import { Suspense, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useConsent } from "@/lib/consent";
import { useIsNativeApp } from "@/lib/native-app";

/**
 * The Meta pixel, or nothing at all.
 *
 * Gated on NEXT_PUBLIC_META_PIXEL_ID and, above that, on consent: nothing here
 * renders until a visitor has agreed (see lib/consent.ts and the banner in
 * components/layout/cookie-notice.tsx). The id gate matters on its own — a
 * preview deployment firing Purchase into this dataset would not merely add
 * noise to a report, it would teach the ad platform to bid on people who
 * bought nothing.
 *
 * The setup runs from script and not from an inline <script> tag, and that is
 * not a style choice. The first version of this file used Meta's own snippet
 * in a `dangerouslySetInnerHTML` script tag, which is exactly right while the
 * tag is part of the HTML the server sends — the parser runs it. But this
 * component does not exist at parse time: it mounts later, when consent is
 * granted, and a script element React creates and inserts at that point does
 * not reliably execute.
 *
 * The symptom in production was precise and quiet. fbevents.js loaded with a
 * 200, 109kB, and not one request to /tr followed it, because `fbq('init', …)`
 * had never run. From the outside a pixel that loads and reports nothing looks
 * exactly like a working one; it took opening the network panel to see that
 * the second request was missing.
 *
 * afterInteractive for the library itself: a measurement script has nothing to
 * do before the page is usable.
 */
export function MetaPixel() {
  const id = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const consent = useConsent();
  /* Not in the app, at any consent. Sending a customer's viewed products,
     searches and purchase amounts to Meta is what Apple calls tracking, and an
     app that does it owes every customer an App Tracking Transparency prompt
     before the first event. Keeping the pixel to the web keeps the app's
     privacy label a plain no — see lib/native-app.ts. */
  const inApp = useIsNativeApp();
  if (!id || consent !== "granted" || inApp) return null;

  // During render, before the <Script> below is even created, and not from an
  // effect: fbevents.js reads window.fbq the moment it executes, and a cached
  // copy can execute before React flushes passive effects. Losing that race is
  // what produced `ReferenceError: fbq is not defined` at fbevents.js:20 in
  // production. Installing the stub is idempotent and touches nothing but a
  // window global, and this line is unreachable on the server — consent reads
  // "unknown" there, so the component has already returned null.
  installFbq();

  return (
    <>
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
        <PageViews id={id} />
      </Suspense>
    </>
  );
}

/**
 * Meta's queue stub, installed from script rather than from markup.
 *
 * Correct in either load order, which is the point. If fbevents.js has already
 * defined fbq this returns immediately and init runs against the real library;
 * if it has not, calls queue here and the library drains them on arrival.
 */
function installFbq() {
  if (window.fbq) return;
  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue?.push(args);
  } as NonNullable<Window["fbq"]>;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = [];
  window.fbq = fbq;
  window._fbq = fbq;
}

/** One PageView per page, including the first. */
function PageViews({ id }: { id: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastSent = useRef<string | null>(null);

  // The stub is already in place (see MetaPixel); this names the dataset.
  // Declared before the view effect so it has run by the time the first one
  // fires: effects execute in declaration order within a component.
  useEffect(() => {
    window.fbq?.("init", id);
  }, [id]);

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
