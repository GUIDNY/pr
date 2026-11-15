"use client";

import { useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, Cookie } from "lucide-react";
import { setConsent, useIsUndecided } from "@/lib/consent";
import { trackVisit } from "@/lib/pageview/track";
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

  /* Counted on the shop's own anonymous visit log (lib/pageview/events.ts),
     so the approval rate is a number and not a guess: consent_choice with
     choice=granted over consent_shown. `variant` names the wording, so a
     change to it can be compared with the one before. */
  const shownLogged = useRef(false);
  useEffect(() => {
    if (!open || shownLogged.current) return;
    shownLogged.current = true;
    trackVisit("consent_shown", { variant: BANNER_VARIANT });
  }, [open]);
  const accept = useCallback(() => {
    trackVisit("consent_choice", { choice: "granted", variant: BANNER_VARIANT });
    setConsent("granted");
  }, []);
  const decline = useCallback(() => {
    trackVisit("consent_choice", { choice: "denied", variant: BANNER_VARIANT });
    setConsent("denied");
  }, []);

  /* The measurement behind #230. A click that lands on the notice's own
     background — not on either of its buttons — and would have landed on
     an הוספה לעגלה button if the notice were not there, is a blocked
     purchase, and the shop's own log should count it rather than a
     consultant finding one by accident. With the body padded for the
     notice (globals.css) this should stay at zero; if it ever does not,
     the padding has regressed. */
  const onBackgroundClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button, a")) return;
    const beneath = document.elementsFromPoint(e.clientX, e.clientY);
    const buy = beneath.find((el) => el instanceof HTMLButtonElement && /הוספה לעגלה/.test(el.textContent ?? ""));
    if (!buy) return;
    const slug = window.location.pathname.startsWith("/product/") ? window.location.pathname.slice("/product/".length) : "";
    trackVisit("add_to_cart_blocked", { productSlug: slug || "-", blockedBy: "consent-banner" });
  }, []);

  if (!open) return null;

  return (
    <div
      ref={ref}
      role="region"
      aria-label="בחירת הסכמה לעוגיות מדידה ופרסום"
      onClick={onBackgroundClick}
      className="fixed inset-x-0 bottom-0 z-[55] px-3 pb-3 sm:px-4 sm:pb-4"
    >
      {/* A card, not a strip. The strip read as small print — one grey line
          across the bottom that most people scrolled past or answered
          without reading — and a question nobody notices is a question
          answered "no" by default, since nothing loads until somebody says
          yes. Now: one plain question in bold, one sentence of why, what is
          loaded in small print with the policy beside it, and two big
          buttons a thumb finds without aiming.

          What did NOT change, and must not: the refusal is the same size,
          the same shape and one tap, right beside the yes. Israel's privacy
          law since Amendment 13 (August 2025) and Google's EU user consent
          policy both read a refusal made harder than a yes as consent that
          was never given — and then the data it collects is the shop's
          liability rather than its asset. The yes is allowed to be the
          brand colour and to come first; it is not allowed to be the only
          button that looks like a button. */}
      <div className="bg-background border-border mx-auto flex max-w-3xl flex-col gap-3 rounded-2xl border p-4 shadow-[0_8px_40px_rgb(0_0_0/0.18)] sm:flex-row sm:items-center sm:gap-5 sm:p-5">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="bg-brand/10 text-brand flex size-10 shrink-0 items-center justify-center rounded-full" aria-hidden="true">
            <Cookie className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-bold leading-snug sm:text-base">מאשרים לנו ללמוד מהגלישה באתר?</p>
            <p className="text-muted-foreground mt-0.5 text-[13px] leading-snug sm:text-sm">
              זה עוזר לנו לשפר את האתר ולהציג לכם פרסומות רלוונטיות. בלי אישור — לא נטען שום כלי מדידה.
            </p>
            <p className="text-muted-foreground/80 mt-1 text-[11px] leading-snug sm:text-xs">
              Google Analytics, Microsoft Clarity ו־Meta Pixel · אפשר לשנות בכל רגע ·{" "}
              <Link href="/privacy" className="text-brand underline underline-offset-2">
                מדיניות פרטיות
              </Link>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-stretch">
          <button
            type="button"
            onClick={accept}
            className="bg-brand text-brand-foreground hover:bg-brand-hover flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl px-5 text-[15px] font-bold shadow-sm transition sm:w-36 sm:flex-none"
          >
            <Check className="size-4" strokeWidth={3} aria-hidden="true" />
            מאשר/ת
          </button>
          <button
            type="button"
            onClick={decline}
            className="bg-muted text-foreground hover:bg-muted/70 border-border flex h-11 flex-1 items-center justify-center rounded-xl border px-5 text-[15px] font-semibold transition sm:w-36 sm:flex-none"
          >
            לא, תודה
          </button>
        </div>
      </div>
    </div>
  );
}

/* Bump when the wording or the look changes, so the log can tell the two
   apart. "strip-1" is everything before 6 November. */
const BANNER_VARIANT = "card-1";
