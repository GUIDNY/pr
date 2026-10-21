import type { VisitEventType } from "@/lib/pageview/events";

/**
 * Report an action to the shop's own visit log, from the browser.
 *
 * A beacon to api/internal/ev with the type, the current path (no query)
 * and the few keys the event allows. The visit cookie rides along on its
 * own (HttpOnly, same-origin); nothing here reads or sends an identifier.
 * Fire-and-forget, never awaited, never thrown: a log line is not worth a
 * slower click or an error in the page. Consent is not asked — the log
 * holds nothing that names a person — see lib/pageview/capture.ts.
 */
export function trackVisit(type: VisitEventType, meta?: Record<string, string | number | boolean>) {
  if (typeof window === "undefined") return;
  try {
    const body = JSON.stringify({ type, path: window.location.pathname, meta: meta ?? null });
    if (!navigator.sendBeacon?.("/api/internal/ev", new Blob([body], { type: "application/json" }))) {
      void fetch("/api/internal/ev", { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } }).catch(
        () => {},
      );
    }
  } catch {
    /* never */
  }
}
