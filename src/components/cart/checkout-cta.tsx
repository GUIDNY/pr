"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { checkoutCtaLabel, useCheckoutResume } from "@/lib/checkout-resume";
import { cn } from "@/lib/utils";

/** The cart's main button. "המשך לתשלום" the first time; "חזרה לקופה" once
    this tab has been to the checkout, with a line saying the typed details
    are still there when they are. Same destination either way. */
export function CheckoutCta({ className, onClick }: { className?: string; onClick?: () => void }) {
  const { label, note } = checkoutCtaLabel(useCheckoutResume());
  return (
    <div className={cn("w-full", className)}>
      <Button variant="brand" size="lg" className="w-full" asChild onClick={onClick}>
        <Link href="/checkout">{label}</Link>
      </Button>
      {note && <p className="text-muted-foreground mt-1 text-center text-xs">{note}</p>}
    </div>
  );
}
