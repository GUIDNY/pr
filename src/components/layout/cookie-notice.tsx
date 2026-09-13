"use client";

import { useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Cookie } from "lucide-react";
import { setConsent, useIsUndecided } from "@/lib/consent";
import { useIsNativeApp } from "@/lib/native-app";

/* This used to be a notice with one "הבנתי" button, and it said so: the site
   set two strictly necessary cookies, there was nothing to switch off, and a
   toggle governing nothing would have been worse than no banner. Its comment
   also named the day this would stop being true — "the day an analytics or
   advertising script is added" — and that day is this commit's parent. Google
   Analytics, Microsoft Clarity and the Meta pixel are all in the layout now.

   So it is a consent gate. What that has to mean, in order:

     Nothing third-party loads until someone chooses. Not loaded-then-muted:
     lib/consent.ts holds the decision and the three components read it before
     they render a script tag at all.

     Refusing is exactly as easy as accepting. Two buttons, same size, same
     row, one click each — and no X in the corner, because a dismissal that
     quietly counts as a yes is the thing this whole category of banner is
     notorious for.

     The choice can be changed. The footer's privacy-settings link clears it
     and brings this back, and withdrawing reloads the page so the scripts
     that were already running are actually gone.

   And the wording is the part that had to change most. The old text told
   visitors "אין באתר עוגיות פרסום, מעקב או פילוח" — there are no advertising,
   tracking or profiling cookies on this site. That sentence was true when it
   was written and would have become a lie the moment the pixel was switched
   on, which is a worse failure than any of the mechanics above. */

export function CookieNotice() {
  const undecided = useIsUndecided();
  const ref = useRef<HTMLDivElement>(null);
  // Staff signed into the back office are not being asked for consent to be
  // measured while they work; the tags stay off there, which is what an
  // undecided state already means.
  const isAdmin = usePathname().startsWith("/admin");

  /* Never inside the iOS app, and this one is not a preference.
   *
   * App Review rejected build 1.0 (3) under guideline 5.1.2(i) for exactly
   * this bar. The reviewer's reasoning is in the text above: it offers to
   * "להתאים פרסום ברשתות של Meta" through the Meta pixel, which is Apple's
   * definition of tracking almost word for word — and an app that asks for
   * that without App Tracking Transparency is refused.
   *
   * The offer was never true inside the app. The pixel and Clarity are both
   * gated on useIsNativeApp and have been since the shell was built; the bar
   * was describing the website to somebody holding the app. Asking for
   * consent to something that cannot happen is not a formality, it is a
   * misdescription, and the reviewer read it as a statement of fact —
   * correctly.
   *
   * So the app gets no consent bar, and with it no analytics at all:
   * google-analytics.tsx carries the same gate, because the honest way to
   * stop asking is to stop having anything to ask about. What remains in the
   * app is the three strictly necessary first-party cookies — session, cart,
   * guest order access — which need no consent in any jurisdiction and are
   * not tracking under any definition. Nothing here needs ATT, because
   * nothing here tracks.
   *
   * The website is untouched: it still asks, still refuses by default, and
   * still loads nothing before somebody chooses. */
  const inApp = useIsNativeApp();

  const open = undecided && !isAdmin && !inApp;

  /* The banner sits across the bottom of the screen, which on a phone is
     exactly where the chat and accessibility launchers live — and burying the
     accessibility button under a notice someone may need that button to read
     is not acceptable. Its real height is published as a custom property and
     the launchers lift by it (globals.css), so nothing is ever covered. */
  useEffect(() => {
    const root = document.documentElement;
    if (!open || !ref.current) {
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
  }, [open]);

  const accept = useCallback(() => setConsent("granted"), []);
  const decline = useCallback(() => setConsent("denied"), []);

  if (!open) return null;

  return (
    <div
      ref={ref}
      role="region"
      aria-label="בחירת הסכמה לעוגיות מדידה ופרסום"
      className="border-border bg-background fixed inset-x-0 bottom-0 z-[55] border-t shadow-[0_-4px_20px_rgb(0_0_0/0.08)]"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4">
        <Cookie className="text-brand size-6 shrink-0" aria-hidden="true" />
        <p className="text-muted-foreground flex-1 text-xs leading-relaxed sm:text-sm">
          לתפעול האתר אנחנו משתמשים בשתי עוגיות הכרחיות בלבד — ההתחברות לחשבון ועגלת הקניות. בנוסף נשמח למדוד
          את השימוש באתר ולהתאים פרסום ברשתות של Meta, בעזרת Google Analytics, Microsoft Clarity ו־Meta Pixel.
          אלה נטענים רק אם תאשרו, ואפשר לשנות את הבחירה בכל רגע.{" "}
          <Link href="/privacy" className="text-brand underline underline-offset-2">
            למדיניות הפרטיות
          </Link>
        </p>
        {/* Same size, same row, same weight. The refusal is not a faint link
            beside a big coloured button — that is the pattern this replaces. */}
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={decline}
            className="bg-muted text-foreground hover:bg-muted/70 border-border min-w-28 rounded-lg border px-5 py-2 text-sm font-medium"
          >
            לא מאשר
          </button>
          <button
            type="button"
            onClick={accept}
            className="bg-brand text-brand-foreground hover:bg-brand-hover border-brand min-w-28 rounded-lg border px-5 py-2 text-sm font-medium"
          >
            מאשר
          </button>
        </div>
      </div>
    </div>
  );
}
