"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";

/**
 * Pelecard's payment form, embedded in our page.
 *
 * Two things this has to survive, and both of them end with the customer able
 * to pay rather than stuck looking at a box:
 *
 * The frame may never load. A browser extension, a corporate proxy or a
 * content-blocker can refuse a third-party frame outright, and it does so
 * silently — no error, just an empty rectangle. So the frame is given a
 * deadline, and if nothing has loaded by then the customer is offered the same
 * payment page as an ordinary link. Nothing is lost by taking it: it is the
 * identical transaction, the same URL the redirect flow would have used.
 *
 * And it has to be tall enough. There is no way to measure the height of a
 * cross-origin document, so this is a floor chosen from the real page and then
 * checked against it: too short and the customer gets a scrollbar inside a
 * scrollbar with the pay button below both, which is what the first embedded
 * version did. 3D Secure raises the floor again — it opens the bank's own
 * challenge in a further frame, which Pelecard size at 615px.
 *
 * No border and no radius. It is embedded inside a card that already has both,
 * and a bordered box inside a bordered box is exactly what an embedded gateway
 * should not look like.
 */

const LOAD_DEADLINE_MS = 12_000;

export function PaymentFrame({ src }: { src: string }) {
  const [state, setState] = useState<"loading" | "ready" | "blocked">("loading");
  const loaded = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!loaded.current) setState("blocked");
    }, LOAD_DEADLINE_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="relative bg-white">
      {state === "loading" && (
        <div className="text-muted-foreground absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white">
          <Loader2 className="text-brand size-8 animate-spin" aria-hidden />
          <p className="text-sm">טוענים את טופס התשלום המאובטח...</p>
        </div>
      )}

      {state === "blocked" && (
        <div className="flex flex-col items-center gap-3 p-8 text-center">
          <p className="font-semibold">טופס התשלום לא נטען כאן</p>
          <p className="text-muted-foreground text-sm">
            לפעמים תוסף בדפדפן או רשת ארגונית חוסמים טפסים מוטמעים. אפשר לפתוח את דף התשלום המאובטח של חברת
            הסליקה — זו אותה עסקה בדיוק.
          </p>
          <a
            href={src}
            className="bg-brand text-brand-foreground flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium"
          >
            <ExternalLink className="size-4" aria-hidden />
            מעבר לתשלום מאובטח
          </a>
        </div>
      )}

      <iframe
        src={src}
        title="טופס תשלום מאובטח"
        // Their form posts to their own domain and runs their scripts; it does
        // not need, and should not have, anything of ours.
        sandbox="allow-scripts allow-forms allow-same-origin allow-top-navigation allow-popups"
        allow="payment"
        onLoad={() => {
          loaded.current = true;
          setState("ready");
        }}
        className={`w-full ${state === "blocked" ? "hidden" : "block"} min-h-[50rem] sm:min-h-[48rem]`}
      />
    </div>
  );
}
