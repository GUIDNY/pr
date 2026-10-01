"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { applyCouponAction } from "@/actions/cart";

/**
 * A club coupon's two actions: copy the code, or put it on the cart and go
 * there. The cart decides whether it applies (minimum, expiry) and says so
 * in its own words, so this does not guess.
 */
export function ClubCouponActions({ code }: { code: string }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("לא הצלחנו להעתיק. אפשר לסמן את הקוד ולהעתיק ידנית");
    }
  };

  const apply = () =>
    start(async () => {
      try {
        await applyCouponAction(code);
        toast.success("הקופון הוחל על העגלה");
        router.push("/cart");
      } catch {
        toast.error("לא הצלחנו להחיל את הקופון. נסו שוב");
      }
    });

  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={copy}
        className="border-border hover:bg-muted inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
      >
        {copied ? <Check className="text-success size-3.5" /> : <Copy className="size-3.5" />}
        {copied ? "הועתק" : "העתקה"}
      </button>
      <button
        type="button"
        onClick={apply}
        disabled={pending}
        className="bg-brand text-brand-foreground hover:bg-brand-hover inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60"
      >
        <ShoppingCart className="size-3.5" />
        {pending ? "מחילים…" : "החלה על העגלה"}
      </button>
    </div>
  );
}
