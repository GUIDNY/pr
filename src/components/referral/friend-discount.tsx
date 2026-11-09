"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gift, X } from "lucide-react";
import { REFERRAL_FLAG_COOKIE, REFERRAL_FRIEND_PERCENT } from "@/lib/referral-rules";
import { formatPrice } from "@/lib/format";
import { SESSION_CHANGED_EVENT, useFriendDiscountOwed, useSignedIn } from "@/components/layout/session-summary-provider";

/**
 * Where a friend's discount stands for this visitor, from two sources:
 *   "owed"   — signed in, and the account carries it (any device);
 *   "invite" — came through a friend's link on this browser and is not
 *              signed in: the discount waits for them to register;
 *   null     — nothing to say.
 * Both are read in the browser, because the shop's pages are cached for
 * everyone: the cookie flag here, the account in the session summary.
 */
function useFriendDiscount(): "owed" | "invite" | null {
  const owed = useFriendDiscountOwed();
  const signedIn = useSignedIn();
  const pathname = usePathname();
  const [cookie, setCookie] = useState(false);
  /* Re-read on every page and after a sign-in: signing in ties the discount
     to the account and clears this cookie, and a bar that read it once at
     load kept asking a signed-in customer to register. */
  useEffect(() => {
    const read = () => setCookie(document.cookie.split("; ").some((c) => c === `${REFERRAL_FLAG_COOKIE}=1`));
    const t = setTimeout(read, 0);
    window.addEventListener(SESSION_CHANGED_EVENT, read);
    return () => {
      clearTimeout(t);
      window.removeEventListener(SESSION_CHANGED_EVENT, read);
    };
  }, [pathname]);
  if (owed) return "owed";
  if (cookie && signedIn === false) return "invite";
  return null;
}

/** A slim bar across the top of the shop. Closable for the rest of the visit. */
export function FriendDiscountBar() {
  const state = useFriendDiscount();
  const pathname = usePathname();
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (sessionStorage.getItem("bt_ref_bar_closed") === "1") setClosed(true);
      } catch {
        /* no storage: keep it open */
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);
  if (!state || closed) return null;
  if (pathname?.startsWith("/admin") || pathname?.startsWith("/checkout/pay") || pathname === "/register") return null;

  const close = () => {
    setClosed(true);
    try {
      sessionStorage.setItem("bt_ref_bar_closed", "1");
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="bg-brand text-brand-foreground">
      <div className="relative mx-auto flex max-w-7xl items-center justify-center gap-2 px-10 py-2 text-center text-sm font-semibold">
        <Gift className="size-4 shrink-0" aria-hidden="true" />
        {state === "owed" ? (
          <span>{REFERRAL_FRIEND_PERCENT}% הנחה מחבר שמורה בחשבון שלך — תופעל אוטומטית בעגלה</span>
        ) : (
          <Link href="/register?friend=1" className="underline-offset-4 hover:underline">
            חבר הזמין אותך: הירשמו וקבלו {REFERRAL_FRIEND_PERCENT}% הנחה בהזמנה הראשונה ←
          </Link>
        )}
        <button type="button" aria-label="סגירה" onClick={close} className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1 hover:bg-white/15">
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}

/** Under the price on a product page: what this visitor will pay with the friend's discount. */
export function FriendPriceLine({ price }: { price: number }) {
  const state = useFriendDiscount();
  if (!state) return null;
  const after = formatPrice(Math.round(price * (1 - REFERRAL_FRIEND_PERCENT / 100)));
  return state === "owed" ? (
    <p className="text-brand flex items-center gap-1.5 text-sm font-semibold">
      <Gift className="size-4" aria-hidden="true" />
      המחיר שלך עם הנחת החבר: {after}
    </p>
  ) : (
    <Link href="/register?friend=1" className="text-brand flex items-center gap-1.5 text-sm font-semibold hover:underline">
      <Gift className="size-4" aria-hidden="true" />
      הירשמו ותשלמו {after} — {REFERRAL_FRIEND_PERCENT}% הנחה מחבר
    </Link>
  );
}
