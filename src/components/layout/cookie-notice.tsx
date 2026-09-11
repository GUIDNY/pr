"use client";

import { useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Cookie } from "lucide-react";
import { setConsent, useIsUndecided } from "@/lib/consent";

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
  const open = undecided && !isAdmin;

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
      {/* One row, not a paragraph. The previous version ran three lines on
          a desktop and five on a phone, and sat over the product page's buy
          bar and the bottom of every listing until someone dealt with it.
          Everything that has to be said is still said — what is strictly
          necessary, which third parties would be loaded, that nothing loads
          until it is allowed, and that the choice can be changed — in two
          sentences instead of four. */}
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:flex-nowrap">
        <Cookie className="text-brand hidden size-5 shrink-0 sm:block" aria-hidden="true" />
        <p className="text-muted-foreground min-w-0 flex-1 text-xs leading-snug sm:text-sm">
          לתפעול האתר יש רק שתי עוגיות הכרחיות (התחברות ועגלה). מדידת שימוש ופרסום דרך Google Analytics,
          Microsoft Clarity ו־Meta Pixel נטענים רק אם תאשרו, ואפשר לשנות את הבחירה בכל רגע.{" "}
          <Link href="/privacy" className="text-brand underline underline-offset-2">
            למדיניות הפרטיות
          </Link>
        </p>
        {/* Same size, same row, same weight. The refusal is not a faint link
            beside a big coloured button — that is the pattern this replaces.
            Below sm: the pair takes its own full-width row under the text,
            each button half of it, so both stay a full-size touch target. */}
        <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto">
          <button
            type="button"
            onClick={decline}
            className="bg-muted text-foreground hover:bg-muted/70 border-border flex-1 rounded-lg border px-4 py-1.5 text-sm font-medium sm:min-w-24 sm:flex-none"
          >
            לא מאשר
          </button>
          <button
            type="button"
            onClick={accept}
            className="bg-brand text-brand-foreground hover:bg-brand-hover border-brand flex-1 rounded-lg border px-4 py-1.5 text-sm font-medium sm:min-w-24 sm:flex-none"
          >
            מאשר
          </button>
        </div>
      </div>
    </div>
  );
}
