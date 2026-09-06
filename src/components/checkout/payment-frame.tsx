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

/* An inline style rather than a Tailwind class, deliberately: the height was
   raised three times while the form kept scrolling, and one explanation that
   could not be ruled out from a screenshot was that the arbitrary-value class
   had never been generated at all. A style attribute cannot be purged.

   62rem stopped the scrolling and left about 350px of dead white below the
   buttons, which is its own kind of unfinished. This is that number trimmed to
   the measured one: the live form is ~645px, taken by scrolling the real page
   between two screenshots and differencing a landmark, not by estimating from
   one. The remaining ~90px is room for a validation line under every field at
   once, which is the tallest the form gets.

   3D Secure is the exception and is left alone deliberately. It replaces the
   form with the bank's own frame, which Pelecard size at 615px and which
   scrolls inside itself anyway, so a moment of overflow there costs less than
   350px of emptiness on every payment that never reaches it. */
/* The height lives in globals.css as .pelecard-frame, not here, because it
   needs a media query: the stylesheet stops pairing the columns below 520px —
   two 195px columns with a caption wrapping inside one of them is not a layout
   — and one field per line is about 170px more form. A frame sized for the
   paired layout would scroll exactly that much on a phone.

   It is a plain class in a real stylesheet rather than a Tailwind arbitrary
   value, for the same reason the height was moved out of a class in the first
   place: min-h-[52rem] had to be generated to exist, and when the form kept
   scrolling there was no way to tell a wrong number from a class that was
   never emitted. A rule written out cannot go missing. */

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
        className={`pelecard-frame w-full ${state === "blocked" ? "hidden" : "block"}`}
      />
    </div>
  );
}
