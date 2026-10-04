"use client";

import { useEffect } from "react";
import { useIsNativeApp } from "@/lib/native-app";

/**
 * Inside the app, the page is the app: it must not zoom.
 *
 * WKWebView honours the viewport meta, and the one Next writes allows
 * scaling. Focusing a small text field made iOS zoom in, and nothing in a
 * WebView ever zooms back out — the shop stayed enlarged until the app was
 * killed. The fields are 16px on touch screens now (globals.css), which
 * stops the zoom from starting; this pins the scale as well, which also
 * snaps an already-zoomed view back to 1 the moment a page with it loads.
 *
 * Only in the app. In a browser a visitor may pinch to read, and taking
 * that away is an accessibility failure the shop does not need to commit.
 */
export function NativeViewport() {
  const inApp = useIsNativeApp();
  useEffect(() => {
    if (!inApp) return;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "viewport";
      document.head.appendChild(meta);
    }
    /* No viewport-fit=cover. It was here at first, and on Android it is an
       instruction to lay the page out underneath the status bar: the
       header's search box ended up with the clock and the signal bars
       drawn over it. The default (auto) keeps the page inside the safe
       area on both platforms, and pinning the scale does not need cover. */
    meta.content = "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no";
  }, [inApp]);
  return null;
}
