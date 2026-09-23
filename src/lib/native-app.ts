"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether this page is being rendered inside the iOS/Android app rather than
 * in a browser.
 *
 * It exists so two third-party scripts stay out of the app. Apple counts
 * sending a customer's activity to another company for advertising as
 * "tracking", and an app that tracks has to declare it and put the App
 * Tracking Transparency prompt in front of every customer before any of it
 * fires. Most people decline that prompt, so the attribution is lost either
 * way; what is left is a permission dialog on first launch, a native plugin,
 * and a declaration that has to keep matching the code forever.
 *
 * The Meta pixel is the clear case: it receives viewed SKUs, search strings,
 * cart values and purchase amounts (lib/analytics/meta.ts). Microsoft Clarity
 * is the careful one — session replay rather than advertising, but Microsoft
 * documents it as able to set MUID, their cross-site identifier, which they
 * also use for advertising. It is a cookie this codebase neither controls nor
 * can enumerate, and "no cookie in the app is used for tracking" should be
 * true by construction rather than by trusting somebody's defaults.
 *
 * Google Analytics stays in both places: first-party cookie only, no Google
 * Ads link, Google Signals disabled.
 *
 * Leaving the pixel out of the app makes "does this app track you" a plain no,
 * and a privacy label is only worth anything when it is true. The web keeps
 * its pixel, which is where the ad spend it measures actually lands.
 *
 * Detected two ways because either alone can be wrong. `window.Capacitor` is
 * the bridge the native shell injects, and it is the honest signal — but the
 * shop is loaded from its live URL rather than bundled, and a bridge that
 * fails to inject would silently turn tracking back on. So the shell also
 * stamps the user agent (appendUserAgent in capacitor.config.ts), and either
 * one is enough.
 */

const UA_MARKER = "BuyTodayApp";

declare global {
  interface Window {
    Capacitor?: { isNativePlatform?: () => boolean };
  }
}

/** Outside React — trackMeta calls this on every event. */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.Capacitor?.isNativePlatform?.()) return true;
    return window.navigator.userAgent.includes(UA_MARKER);
  } catch {
    return false;
  }
}

/* Nothing ever changes this within a session: a page is either inside the app
   or it is not. The store exists only so the value can be read the same way
   consent is, without a hydration mismatch. */
function subscribe() {
  return () => {};
}

/**
 * As a React value. The server has no user agent for the browser it is
 * rendering for and no bridge to ask, so it answers `false` — the same answer
 * as the web, which is the one that changes nothing about how the site
 * already behaves. The client corrects it on hydration, before consent can
 * have been read.
 */
export function useIsNativeApp(): boolean {
  return useSyncExternalStore(subscribe, isNativeApp, () => false);
}
