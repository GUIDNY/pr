"use client";

import Script from "next/script";
import { Suspense, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useConsent } from "@/lib/consent";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Google Analytics 4, or nothing at all.
 *
 * Gated on NEXT_PUBLIC_GA_ID: with no id set — preview builds, and any local
 * development — this renders null and no Google script is fetched. A preview
 * deployment reporting into the production property would quietly corrupt the
 * shop's own numbers, and the numbers are the only reason to install it.
 *
 * afterInteractive, not beforeInteractive. The whole point of the caching
 * work this shipped alongside was to stop making a visitor wait on things
 * that are not the page; a measurement tag is exactly such a thing, and it
 * has nothing to do before the page is usable.
 */
export function GoogleAnalytics() {
  const id = process.env.NEXT_PUBLIC_GA_ID;
  // Consent first, and consent means BEFORE the script is fetched. An
  // unanswered banner and a refusal both render nothing at all — see
  // lib/consent.ts for why "load it and switch it off" is not the same thing.
  const consent = useConsent();
  if (!id || consent !== "granted") return null;

  /* Google's two setup lines used to be an inline <script> here, which was
     right while this component was part of the server's HTML: the parser ran
     it before gtag/js arrived. It is not part of that HTML any more — consent
     mounts this component later — and a script element React inserts after
     hydration does not reliably execute. The Meta pixel failed in exactly this
     way in production (see meta-pixel.tsx), silently, and this is the same
     mistake one file over. So the queue is installed from script, during
     render, before the tag below is created. */
  installGtag(id);

  return (
    <>
      {/*
        The tag file itself is fetched after the page is interactive, so it
        never competes with the page for the network.
      */}
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${id}`}
        strategy="afterInteractive"
      />
      {/*
        useSearchParams reads the URL on the client, and a component doing
        that outside a Suspense boundary opts its whole route out of static
        rendering — which would undo the caching this was built around. The
        boundary is safe here in a way it was not for src/app/(shop)/loading.tsx:
        that one wrapped the shop's actual content and pushed it out of <main>
        where no crawler could see it. This wraps a component that renders
        nothing at all.
      */}
      <Suspense fallback={null}>
        <PageViews id={id} />
      </Suspense>
    </>
  );
}

/**
 * dataLayer and gtag, exactly as Google's snippet defines them.
 *
 * Idempotent: called on every render of the component and does its work once.
 * `arguments` rather than rest parameters because gtag.js reads the Arguments
 * object the snippet pushes, and an array is not the same thing to it.
 */
function installGtag(id: string) {
  if (window.gtag) return;
  window.dataLayer = window.dataLayer || [];
  // eslint-disable-next-line prefer-rest-params
  const gtag = function () { window.dataLayer!.push(arguments); } as (...args: unknown[]) => void;
  window.gtag = gtag;
  gtag("js", new Date());
  // send_page_view:false — every view is sent from PageViews below instead,
  // because in the App Router a navigation never reloads the document.
  gtag("config", id, { send_page_view: false });
}

/**
 * One page_view per page, including the first.
 *
 * gtag is configured with send_page_view:false and every view is sent from
 * here instead. In the App Router a navigation is a client-side render — the
 * document never reloads — so the automatic tag would report the entry page
 * and then nothing for the rest of the visit, which reads in GA as a site
 * nobody browses.
 *
 * Sending them explicitly also makes the count independent of the property's
 * Enhanced Measurement settings, rather than depending on which of two
 * mechanisms happens to be switched on.
 */
function PageViews({ id }: { id: string }) {
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

    window.gtag?.("event", "page_view", {
      send_to: id,
      page_path: path,
      page_location: window.location.href,
      page_title: document.title,
    });
  }, [id, pathname, searchParams]);

  return null;
}
