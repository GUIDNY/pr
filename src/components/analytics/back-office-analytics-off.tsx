"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** The back office: the shop's own staff at work, never a visitor. */
export function isBackOfficePath(pathname: string | null | undefined): boolean {
  return !!pathname && (pathname === "/admin" || pathname.startsWith("/admin/"));
}

/**
 * Keeps the back office out of GA4.
 *
 * A quarter of the property's page views in the week to 6 November were us —
 * "הזמנות | Buy Today Admin" alone 179 of 787 — and every one of them is a
 * visit no campaign brought and no customer made. GoogleAnalytics and
 * GoogleTagManager already refuse to load on an /admin page; this covers the
 * other way in, a staff member who opened the shop first (the tags loaded
 * there) and then went to the back office in the same tab, where a client
 * navigation keeps the loaded tags running.
 *
 * `ga-disable-<measurement id>` is Google's own switch, honoured by gtag.js
 * and by GA4 tags fired from GTM alike, and it is read on every hit, so
 * flipping it per route turns measurement off on the way in and back on on
 * the way out.
 */
export function BackOfficeAnalyticsOff() {
  const pathname = usePathname();
  useEffect(() => {
    const id = process.env.NEXT_PUBLIC_GA_ID;
    if (!id) return;
    (window as unknown as Record<string, unknown>)[`ga-disable-${id}`] = isBackOfficePath(pathname);
  }, [pathname]);
  return null;
}
