/**
 * The page's first word to the visit log, and the gate every later beacon
 * waits behind.
 *
 * A page can reach the screen without the proxy ever issuing the visit
 * cookie — a prefetched or prerendered document never makes the request the
 * proxy sees (api/internal/pv/nav explains how that lost a paying customer's
 * whole visit on 16 November). So on the first render the page sends one
 * landing beacon. The server writes nothing if the cookie is already there,
 * and otherwise issues one and logs the page.
 *
 * Every other beacon (navigations, events) waits for that answer first. If
 * they all went at once, each would arrive without a cookie and each would
 * be given a different id, which is one visit split into several. The wait
 * is capped, so a slow answer delays a log line and never anything a
 * shopper sees.
 *
 * Whoever asks first sends the landing beacon — the consent banner's effect
 * can run before PathLog's — so the order components mount in does not
 * matter.
 */
const WAIT_CAP_MS = 2500;

let ready: Promise<void> | null = null;

export function whenVisitReady(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (ready) return ready;
  const landing = fetch("/api/internal/pv/nav", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      landing: true,
      path: window.location.pathname,
      search: window.location.search,
      referrer: document.referrer || null,
    }),
  }).then(
    () => undefined,
    () => undefined,
  );
  const cap = new Promise<void>((resolve) => setTimeout(resolve, WAIT_CAP_MS));
  ready = Promise.race([landing, cap]);
  return ready;
}
