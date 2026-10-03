"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { showsBottomNav } from "@/lib/bottom-nav";
import {
  FROM_MALL_EVENT,
  FROM_MALL_KEY,
  MALL_GAME_UTM_SOURCE,
  MALL_WEB_ORIGIN,
  MALL_CHECKOUT_RETURN,
  isMallCheckout,
  isMallEmbed,
  leavesMallFrame,
  postToMall,
} from "@/lib/mall";
import { cn } from "@/lib/utils";
import { PAYMENT_CAPTURED_EVENT } from "@/components/analytics/meta-events";
import { useMallInView } from "@/components/layout/mall-link";

/**
 * The shop's half of the 3D mall's conversation — see lib/mall.ts for the
 * whole of it. Renders nothing; it is in the root layout so it runs on every
 * page, once per page load.
 *
 * Embedded (a product page inside the game's frame):
 *
 *   It re-asserts the data-embed attribute the <head> script set, for the
 *   one case where that script cannot have run — a client-side navigation
 *   never re-executes it, but it never needs to either, since the attribute
 *   is on <html> and survives. This is only a belt to those braces.
 *
 *   It sends every link to cart, checkout, login, register and account to
 *   the whole window rather than the frame. A capture listener on the
 *   document rather than an edit to every link, because those links are
 *   everywhere — the cart drawer, the product page, the favourites prompt —
 *   and the next one somebody adds should not have to know about the game.
 *   It marks the link target="_top" before React sees the click; Next's
 *   <Link> treats any target other than _self as "let the browser do it",
 *   so the navigation is the browser's own, which is also the kind a frame
 *   is allowed to do to the page above it on a tap. Navigations done in
 *   code instead of by a link go through navigateOutOfMallFrame.
 *
 *   It tells the game the page is ready.
 *
 * Not embedded: a page opened from the game's links (utm_source =
 * closing-time-game) remembers, for this tab, that the customer came from
 * the mall — which is what BackToMallPill shows on.
 */
export function MallBridge() {
  useEffect(() => {
    if (isMallEmbed()) {
      document.documentElement.setAttribute("data-embed", "mall");

      function onClick(event: MouseEvent) {
        if (event.defaultPrevented || event.button !== 0) return;
        const anchor = (event.target as Element | null)?.closest?.("a[href]");
        if (!(anchor instanceof HTMLAnchorElement)) return;
        let url: URL;
        try {
          url = new URL(anchor.href, window.location.href);
        } catch {
          return;
        }
        if (url.origin !== window.location.origin || !leavesMallFrame(url.pathname)) return;
        /* A sign-in from the game's checkout would land on the shop's own
           checkout, outside the game. Point it back at the game instead,
           which reopens its checkout with the customer now signed in. */
        if (isMallCheckout() && /^\/(checkout|cart)(\/|$|\?)/.test(url.searchParams.get("redirect") ?? "")) {
          url.searchParams.set("redirect", MALL_CHECKOUT_RETURN);
          anchor.href = url.href;
        }
        anchor.target = "_top";
      }
      document.addEventListener("click", onClick, true);
      postToMall({ type: "bt-mall:ready" });
      return () => document.removeEventListener("click", onClick, true);
    }

    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("utm_source") === MALL_GAME_UTM_SOURCE) {
        window.sessionStorage.setItem(FROM_MALL_KEY, "1");
        window.dispatchEvent(new Event(FROM_MALL_EVENT));
      }
    } catch {
      /* Storage refused (private mode on some browsers): no pill, no harm. */
    }
  }, []);

  return null;
}

/**
 * Tells the game an order is paid, so the mall can celebrate it and close its
 * checkout. Mirrors MetaPurchase: an order that is already paid (or needs no
 * payment) reports on arrival; a gateway order reports when
 * PaymentConfirmation announces the payment settled, and not before — a
 * declined card must never look like a purchase in the game. Outside the
 * game's frames postToMall does nothing.
 */
export function ReportOrderToMall({ orderNumber, total, paid }: { orderNumber: string; total: number; paid: boolean }) {
  useEffect(() => {
    const send = () => postToMall({ type: "bt-mall:ordered", orderNumber, total });
    if (paid) {
      send();
      return;
    }
    const onCaptured = (e: Event) => {
      if ((e as CustomEvent<{ orderNumber: string }>).detail?.orderNumber === orderNumber) send();
    };
    window.addEventListener(PAYMENT_CAPTURED_EVENT, onCaptured);
    return () => window.removeEventListener(PAYMENT_CAPTURED_EVENT, onCaptured);
  }, [orderNumber, total, paid]);

  return null;
}

function subscribeFromMall(onChange: () => void) {
  window.addEventListener(FROM_MALL_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(FROM_MALL_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readFromMall(): boolean {
  try {
    return window.sessionStorage.getItem(FROM_MALL_KEY) === "1" && !isMallEmbed();
  } catch {
    return false;
  }
}

/**
 * "Back to the mall", for a customer who followed a product out of the game.
 *
 * The game opens the shop in the same tab (and in the app there is no other
 * tab), so without this the way back is the browser's back button, several
 * pages deep, or nothing at all in the app. The flag is per tab and per
 * visit (sessionStorage), set by MallBridge; the ✕ clears it, and so does
 * closing the tab.
 *
 * Bottom-start, where it covers the least: the accessibility launcher owns
 * bottom-end. Above the tab bar where the tab bar shows; above Alfred's
 * bubble and the product page's buy bar where it does not; beside the
 * bubble from lg:, where the bubble drops to the corner. Carries
 * floating-launcher so the cookie bar lifts it like the other launchers, and
 * data-site-chrome so it never shows inside the game's own frame — the
 * frame shares this tab's storage in the app, so the flag alone would not
 * keep it out.
 */
export function BackToMallPill() {
  const fromMall = useSyncExternalStore(subscribeFromMall, readFromMall, () => false);
  const inApp = useMallInView();
  const pathname = usePathname();

  if (!fromMall || pathname.startsWith("/admin")) return null;

  const hasTab = showsBottomNav(pathname);
  const href = inApp ? "/mall" : `${MALL_WEB_ORIGIN}/`;

  return (
    <div
      data-site-chrome
      className={cn(
        "floating-launcher bg-brand text-brand-foreground fixed start-4 z-50 flex items-center rounded-full shadow-lg",
        "bottom-[calc(10rem+env(safe-area-inset-bottom))] lg:start-24 lg:bottom-8",
        hasTab && "max-sm:bottom-[calc(4.5rem+env(safe-area-inset-bottom))]",
      )}
    >
      <a href={href} className="hover:bg-brand-hover rounded-s-full py-2 ps-4 pe-2 text-sm font-bold transition-colors">
        חזרה לקניון 🎮
      </a>
      <button
        type="button"
        aria-label="הסתרת הקישור לקניון"
        onClick={() => {
          try {
            window.sessionStorage.removeItem(FROM_MALL_KEY);
          } catch {
            /* Nothing stored, nothing to clear. */
          }
          window.dispatchEvent(new Event(FROM_MALL_EVENT));
        }}
        className="hover:bg-brand-hover flex size-9 items-center justify-center rounded-e-full border-s border-white/25 transition-colors"
      >
        <X aria-hidden className="size-4" />
      </button>
    </div>
  );
}
