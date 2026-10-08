"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Starts a top-up and sends the whole window to Pelecard's form. Not the
 * framed checkout: a top-up has nothing of ours to keep on screen around the
 * form, and Pelecard returns the customer to /account/wallet either way.
 */
export function TopupButton({ packageId, label, disabled }: { packageId: string; label: string; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    try {
      const res = await fetch("/api/wallet/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId }),
      });
      const body = (await res.json().catch(() => ({}))) as { redirectUrl?: string; error?: string };
      if (!res.ok || !body.redirectUrl) {
        toast.error(res.status === 429 ? "נפתחו יותר מדי טעינות בשעה האחרונה. נסו שוב מאוחר יותר." : "לא הצלחנו לפתוח את טופס התשלום. נסו שוב.");
        setBusy(false);
        return;
      }
      window.location.assign(body.redirectUrl);
    } catch {
      toast.error("לא הצלחנו לפתוח את טופס התשלום. נסו שוב.");
      setBusy(false);
    }
  }

  return (
    <Button variant="brand" className="w-full" disabled={disabled || busy} onClick={start}>
      {busy ? "פותח תשלום…" : label}
    </Button>
  );
}

/**
 * The browser is usually back from Pelecard a second or two before their
 * server-side notification is. Refreshes the page (which reads the top-up's
 * real status) every few seconds, for a minute at most.
 */
export function TopupPendingRefresh() {
  const router = useRouter();
  useEffect(() => {
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (tries > 20) {
        clearInterval(timer);
        return;
      }
      router.refresh();
    }, 3_000);
    return () => clearInterval(timer);
  }, [router]);
  return null;
}
