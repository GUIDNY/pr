"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { REFERRAL_FRIEND_PERCENT } from "@/lib/referral-rules";

/**
 * The landing of a friend's link (/r/<code> redirects to /?friend=1): say
 * that the discount is waiting, once, and take the marker off the address
 * so a reload or a shared screenshot does not say it again.
 * Read from window.location in an effect rather than useSearchParams, which
 * would need a Suspense boundary in the root layout.
 */
export function FriendWelcome() {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("friend") !== "1") return;
    toast.success(`ברוכים הבאים! ${REFERRAL_FRIEND_PERCENT}% הנחה מחבר יופעלו אוטומטית בהזמנה הראשונה שלכם`, { duration: 8000 });
    url.searchParams.delete("friend");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, []);
  return null;
}
