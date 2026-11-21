"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { whenVisitReady } from "@/lib/pageview/visit-ready";

/**
 * Reports in-app navigations to the first-party path log.
 *
 * Full page loads are logged by the proxy (src/proxy.ts); this covers the
 * moves the proxy cannot see. The App Router prefetches the page behind a
 * link on hover or on scroll and then renders a click from that cache, so
 * most navigations never send a request at all. The page knows when its
 * path changed, and says so — path, query and the path it left, nothing
 * else. The visit cookie travels with the beacon on its own (HttpOnly,
 * same-origin), the server reads it there, and nothing here can see it.
 *
 * Independent of the consent banner on purpose: it reports to the shop's
 * own server, carries no identifier beyond a session cookie that lapses
 * within a day, and loads no third party. See lib/pageview/capture.ts for
 * what the server keeps of it.
 *
 * The first render sends the landing beacon (lib/pageview/visit-ready.ts):
 * the server ignores it when the proxy already logged that load, and logs
 * it and issues the visit cookie when the proxy never saw it — a page that
 * arrived prefetched. /admin is refused server-side as well as skipped here.
 */
export function PathLog() {
  const pathname = usePathname();
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (last.current === null) {
      last.current = pathname;
      if (!pathname.startsWith("/admin")) void whenVisitReady();
      return;
    }
    if (last.current === pathname) return;
    const from = last.current;
    last.current = pathname;
    if (pathname.startsWith("/admin")) return;

    const body = JSON.stringify({ path: pathname, search: window.location.search, from });
    void whenVisitReady().then(() => beacon(body));
  }, [pathname]);

  return null;
}

function beacon(body: string) {
  try {
    if (!navigator.sendBeacon?.("/api/internal/pv/nav", new Blob([body], { type: "application/json" }))) {
      void fetch("/api/internal/pv/nav", { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } }).catch(() => {});
    }
  } catch {
    /* a log line is never worth an error in the page */
  }
}
