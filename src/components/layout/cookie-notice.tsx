"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Cookie, X } from "lucide-react";

/* The site sets two cookies and both are strictly necessary — the signed-in
   session and the cart id — so there is nothing here to switch off: refusing
   them means no login and no cart. That is why this is a notice with one
   acknowledgement, and not a consent manager with per-category toggles. The
   day an analytics or advertising script is added, this component is the wrong
   shape for it: that needs real consent, taken BEFORE the script loads, with a
   refusal that actually blocks it, and it must be as easy to refuse as to
   accept. Adding a toggle here that governs nothing would be worse than having
   no banner at all. */

const STORAGE_KEY = "prec-cookie-notice";

let snapshot: boolean | null = null;
const listeners = new Set<() => void>();

function readAcknowledged(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    // Storage blocked: show the notice rather than assume it was read.
    return false;
  }
}

function getSnapshot() {
  snapshot ??= readAcknowledged();
  return snapshot;
}

// The server can't know whether this visitor has seen the notice, so it renders
// nothing and the client fills it in after hydration — same reasoning as the
// accessibility widget, and no hydration mismatch either way.
function getServerSnapshot() {
  return true;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function acknowledge() {
  snapshot = true;
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // Nothing to persist; the notice simply returns on the next visit.
  }
  listeners.forEach((listener) => listener());
}

export function CookieNotice() {
  const acknowledged = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const ref = useRef<HTMLDivElement>(null);
  // The notice is for visitors. Staff signed into the back office are not
  // being informed of anything by a bar across the bottom of their work.
  const isAdmin = usePathname().startsWith("/admin");

  /* The banner sits across the bottom of the screen, which on a phone is
     exactly where the chat and accessibility launchers live — and burying the
     accessibility button under a notice someone may need that button to read
     is not acceptable. Its real height is published as a custom property and
     the launchers lift by it (globals.css), so nothing is ever covered. */
  useEffect(() => {
    const root = document.documentElement;
    if (acknowledged || isAdmin || !ref.current) {
      root.removeAttribute("data-cookie-notice");
      root.style.removeProperty("--cookie-notice-h");
      return;
    }
    const el = ref.current;
    const publishHeight = () => {
      root.style.setProperty("--cookie-notice-h", `${el.offsetHeight + 12}px`);
      root.setAttribute("data-cookie-notice", "open");
    };
    publishHeight();
    const observer = new ResizeObserver(publishHeight);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.removeAttribute("data-cookie-notice");
      root.style.removeProperty("--cookie-notice-h");
    };
  }, [acknowledged, isAdmin]);

  const dismiss = useCallback(() => acknowledge(), []);

  if (acknowledged || isAdmin) return null;

  return (
    <div
      ref={ref}
      role="region"
      aria-label="הודעה על שימוש בעוגיות"
      className="border-border bg-background fixed inset-x-0 bottom-0 z-[55] border-t shadow-[0_-4px_20px_rgb(0_0_0/0.08)]"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4">
        <Cookie className="text-brand size-6 shrink-0" aria-hidden="true" />
        <p className="text-muted-foreground flex-1 text-xs leading-relaxed sm:text-sm">
          האתר משתמש בעוגיות הכרחיות בלבד — לשמירת ההתחברות לחשבון ולעגלת הקניות. אין באתר עוגיות פרסום, מעקב או
          פילוח.{" "}
          <Link href="/privacy" className="text-brand underline underline-offset-2">
            למדיניות הפרטיות
          </Link>
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={dismiss}
            className="bg-brand text-brand-foreground hover:bg-brand-hover rounded-lg px-5 py-2 text-sm font-medium"
          >
            הבנתי
          </button>
          <button
            type="button"
            onClick={dismiss}
            aria-label="סגירת ההודעה"
            className="hover:bg-muted text-muted-foreground rounded-lg p-2"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
