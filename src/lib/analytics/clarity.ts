/**
 * The call queue Microsoft Clarity's tag file expects to find already there.
 *
 * `clarity.ms/tag/{id}` is 726 bytes and it is not the recorder — it is a
 * bootstrap whose third statement reads `a[c].v||a[c].t`, where `a[c]` is
 * `window.clarity`. With nothing at that name it throws
 * `Cannot read properties of undefined (reading 'v')` and stops, several
 * statements before the line that would have appended the recorder itself.
 * That is not a theory about Microsoft's code: it is Microsoft's code, and
 * check-clarity.ts runs it.
 *
 * So the stub is the installation, and the tag is the smaller half. What it
 * has to be is a function with a `q` array, because that is the shape the
 * engine drains on arrival:
 *
 *     var t = window.clarity && window.clarity.q || [];
 *     for (window.clarity = function (…) {…}, window.clarity.v = version;
 *          t.length > 0;)
 *       window.clarity.apply(window, t.shift());
 *
 * `.apply` takes any array-like, so a rest array queues as well as the
 * `arguments` object Microsoft's own snippet pushes. `.v` is the engine
 * stamping its version once it has taken over, which is what the tag's
 * duplicate-tag guard above is reading for; `.t` is the tag marking that it
 * has already run.
 *
 * Kept out of the component so that a script can call it. The component is
 * "use client" and pulls in next/script, which a plain tsx run cannot load —
 * the same reason search-highlight.ts is its own file.
 */

export type ClarityApi = ((...args: unknown[]) => void) & {
  /** Calls made before the recorder arrived. It drains this on load. */
  q?: unknown[];
  /** The engine's version, once it has replaced this stub. */
  v?: unknown;
  /** Set by the tag file to mark that it has already run. */
  t?: boolean;
};

declare global {
  interface Window {
    clarity?: ClarityApi;
  }
}

/** `window`, or a stand-in under test. */
export type ClarityHost = { clarity?: ClarityApi };

/**
 * Put the queue in place. Idempotent, and never overwrites a `clarity` that
 * is already there — by then it is either a second copy of this stub or the
 * real engine, and replacing the engine would throw away a live recording.
 *
 * The queue is held in the closure rather than looked up through
 * `window.clarity` on every call, which is the one place this departs from
 * Microsoft's published snippet. Same array either way: it lives on the
 * function object that *is* `window.clarity`, which is where the engine
 * looks for it. The difference would only show if something kept a
 * reference to this stub and called it after the engine had replaced the
 * global — and nothing in this codebase calls clarity at all.
 */
export function installClarity(host: ClarityHost): void {
  if (host.clarity) return;
  const clarity = function (...args: unknown[]) {
    (clarity.q ??= []).push(args);
  } as ClarityApi;
  clarity.q = [];
  host.clarity = clarity;
}
