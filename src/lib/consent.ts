"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether this visitor has agreed to be measured.
 *
 * The shop sets two cookies of its own — the signed-in session and the cart id
 * — and both are strictly necessary: refusing them means no login and no cart,
 * so there is nothing to ask about. Everything else on this page is a third
 * party that wants to know who is reading it, and that is what this governs:
 * Google Analytics, Microsoft Clarity, and the Meta pixel.
 *
 * Three rules shape the whole file, and they are the ones cookie-notice.tsx
 * spent a year saying it did not implement:
 *
 *  1. Consent is taken BEFORE the script loads. Not "loaded and then disabled",
 *     not Google's consent-mode-with-denied-defaults, which still fetches the
 *     tag and still tells Google someone is here. A visitor who has not decided
 *     gets no third-party script at all.
 *  2. Refusing has to be exactly as easy as accepting. One click either way,
 *     two buttons of the same size, and no X in the corner — a dismissal that
 *     silently counts as agreement is the oldest dark pattern in the trade.
 *  3. A decision can be changed. "לא מאשר" is not a life sentence and neither
 *     is "מאשר"; the footer reopens this, and choosing again takes effect on
 *     the spot.
 *
 * The old key is deliberately not migrated. `prec-cookie-notice` recorded that
 * somebody had *read* a notice which told them there was no tracking on this
 * site. Reading that is not agreement to be tracked, and treating it as
 * agreement would be the worst thing in this file.
 */

export type ConsentState = "unknown" | "granted" | "denied";

const STORAGE_KEY = "prec-consent";

let snapshot: ConsentState | null = null;
const listeners = new Set<() => void>();

function read(): ConsentState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === "granted" || raw === "denied" ? raw : "unknown";
  } catch {
    // Storage blocked (a private window, or a browser set to refuse site
    // data). Nothing was agreed to, so nothing may load — and the banner
    // shows again, which is the honest outcome rather than the convenient one.
    return "unknown";
  }
}

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ConsentState {
  snapshot ??= read();
  return snapshot;
}

/**
 * The server has no idea what this visitor decided, so it renders the state
 * that shows nothing and loads nothing, and the client corrects it after
 * hydration. Rendering "granted" here to save a flicker would put the tags in
 * the HTML of someone who refused them.
 */
function getServerSnapshot(): ConsentState {
  return "unknown";
}

/** The current decision, as a React value. */
export function useConsent(): ConsentState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Whether the banner should be up — the same decision, read with the opposite
 * server default.
 *
 * The tags must render nothing on the server, because the server cannot know
 * this visitor said yes and putting a tag in the HTML of someone who said no
 * is the whole failure. The banner must also render nothing on the server, for
 * the mirror-image reason: the server cannot know this visitor already
 * answered, and shipping the bar to everyone would flash it at every returning
 * customer on every page. One state, two server defaults, both of them the
 * quiet one.
 */
export function useIsUndecided(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => getSnapshot() === "unknown",
    () => false,
  );
}

/**
 * The current decision, outside React.
 *
 * trackMeta calls this before every event. The pixel cannot load without
 * consent, so an event sent without it would no-op anyway — but the event
 * helpers also write to localStorage (the Purchase guard), and storing
 * anything for a measurement purpose is exactly what was refused.
 */
export function consentGranted(): boolean {
  if (typeof window === "undefined") return false;
  return getSnapshot() === "granted";
}

/** Record a decision and apply it immediately. */
export function setConsent(next: "granted" | "denied") {
  const wasGranted = getSnapshot() === "granted";
  snapshot = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Not persisted; the choice still holds for this page and is asked again
    // on the next visit.
  }
  emit();
  if (wasGranted && next === "denied") reloadWithoutTags();
}

/**
 * Ask again — the footer's "הגדרות פרטיות" link.
 *
 * Clearing the stored answer rather than opening a separate dialog is what
 * makes withdrawal real: the banner comes back with both buttons, and the
 * reload below guarantees the scripts are actually gone.
 */
export function resetConsent() {
  const wasGranted = getSnapshot() === "granted";
  snapshot = "unknown";
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
  emit();
  if (wasGranted) reloadWithoutTags();
}

/**
 * Withdrawing consent has to remove the scripts, not just stop feeding them.
 *
 * Un-rendering the React component that wrote the tag does not unload
 * anything: gtag, clarity and fbq are already defined on window, their own
 * timers and beacons are already scheduled, and nothing in this codebase can
 * call them back. The only honest way to end a session that has them is to
 * start a new document without them — so a withdrawal reloads the page, and
 * the reloaded page renders no tags at all.
 *
 * A grant does not need this. The components mount the scripts as soon as the
 * snapshot changes, with no reload and no lost page state.
 */
function reloadWithoutTags() {
  window.location.reload();
}
