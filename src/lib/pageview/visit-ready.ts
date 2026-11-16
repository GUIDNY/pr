/**
 * The page's first word to the visit log, and the gate every later beacon
 * waits behind.
 *
 * A page can reach the screen without the proxy ever logging it: Chrome
 * prefetches or prerenders a Google result (`Sec-Purpose: prefetch;
 * prerender`), the proxy treats that request as a prefetch — not a view —
 * and the click then shows the page without asking again. Until 16 November
 * the proxy did not even issue the visit cookie on such a request, and the
 * beacons dropped everything without one, which is how a paying customer's
 * whole visit went unrecorded (api/internal/pv/nav has the account).
 *
 * So on the first render the page sends one landing beacon, saying whether
 * it was prefetched or prerendered. The server logs it when the proxy did
 * not (no cookie, or `prefetched`), and otherwise writes nothing.
 *
 * A prerendered page runs its scripts before anyone looks at it, and may
 * never be looked at. The beacon therefore waits for activation — the
 * moment the page is actually shown — so a page nobody opened is not logged
 * as a view, and the row's time is the time it was seen.
 *
 * Every other beacon (navigations, events) waits for the landing answer
 * first. If they all went at once, each would arrive without a cookie and
 * be given a different id: one visit split into several. The wait is capped
 * after activation, so a slow answer delays a log line and never anything a
 * shopper sees. Whoever asks first sends the landing beacon — the consent
 * banner's effect can run before PathLog's — so mount order does not matter.
 */
const WAIT_CAP_MS = 2500;

let ready: Promise<void> | null = null;

type PrerenderDocument = Document & { prerendering?: boolean };
type ActivatedEntry = PerformanceNavigationTiming & { activationStart?: number; deliveryType?: string };

function activated(): Promise<void> {
  const doc = document as PrerenderDocument;
  if (!doc.prerendering) return Promise.resolve();
  return new Promise((resolve) => doc.addEventListener("prerenderingchange", () => resolve(), { once: true }));
}

/** Was this document fetched ahead of the click — prerendered (activation
    came after the start of navigation) or served from a navigational
    prefetch? Either way the proxy saw a prefetch, not a view. */
function wasPrefetched(): boolean {
  try {
    const nav = performance.getEntriesByType("navigation")[0] as ActivatedEntry | undefined;
    if (!nav) return false;
    return (nav.activationStart ?? 0) > 0 || nav.deliveryType === "navigational-prefetch";
  } catch {
    return false;
  }
}

export function whenVisitReady(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (ready) return ready;
  ready = activated().then(() => {
    const landing = fetch("/api/internal/pv/nav", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        landing: true,
        prefetched: wasPrefetched(),
        path: window.location.pathname,
        search: window.location.search,
        referrer: document.referrer || null,
      }),
    }).then(
      () => undefined,
      () => undefined,
    );
    const cap = new Promise<void>((resolve) => setTimeout(resolve, WAIT_CAP_MS));
    return Promise.race([landing, cap]);
  });
  return ready;
}
