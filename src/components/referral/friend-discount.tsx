"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Gift, X } from "lucide-react";
import { REFERRAL_FLAG_COOKIE, REFERRAL_FRIEND_PERCENT } from "@/lib/referral-rules";
import { formatPrice } from "@/lib/format";

/* Read in an effect: the pages are cached for everyone, so whether this
   visitor came through a friend's link is known only in their browser. */
function useFriendDiscount(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const check = () => setOn(document.cookie.split("; ").some((c) => c === `${REFERRAL_FLAG_COOKIE}=1`));
    const t = setTimeout(check, 0);
    return () => clearTimeout(t);
  }, []);
  return on;
}

/**
 * A slim bar across the top of the shop for a visitor who came through a
 * friend's link, until they order — the welcome toast is gone in eight
 * seconds and the discount waits for up to sixty days. Closable for the
 * rest of the visit. Not on the back office, and not on the payment step.
 */
export function FriendDiscountBar() {
  const on = useFriendDiscount();
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
  if (!on || closed || pathname?.startsWith("/admin") || pathname?.startsWith("/checkout/pay")) return null;
  return (
    <div className="bg-brand text-brand-foreground">
      <div className="mx-auto flex max-w-7xl items-center justify-center gap-2 px-10 py-2 text-center text-sm font-semibold relative">
        <Gift className="size-4 shrink-0" aria-hidden="true" />
        <span className="sm:hidden">{REFERRAL_FRIEND_PERCENT}% הנחה מחבר — תופעל אוטומטית בעגלה</span>
        <span className="hidden sm:inline">
          יש לך {REFERRAL_FRIEND_PERCENT}% הנחה מחבר — תופעל אוטומטית בעגלה בהזמנה הראשונה
        </span>
        <button
          type="button"
          aria-label="סגירה"
          onClick={() => {
            setClosed(true);
            try {
              sessionStorage.setItem("bt_ref_bar_closed", "1");
            } catch {
              /* ignore */
            }
          }}
          className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1 hover:bg-white/15"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}

/** Under the price on a product page: what this visitor will actually pay. */
export function FriendPriceLine({ price }: { price: number }) {
  const on = useFriendDiscount();
  if (!on) return null;
  const after = Math.round(price * (1 - REFERRAL_FRIEND_PERCENT / 100));
  return (
    <p className="text-brand flex items-center gap-1.5 text-sm font-semibold">
      <Gift className="size-4" aria-hidden="true" />
      המחיר שלך עם הנחת החבר: {formatPrice(after)}
    </p>
  );
}
