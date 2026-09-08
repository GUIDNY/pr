"use client";

import { useConsent } from "@/lib/consent";


/**
 * Microsoft Clarity, or nothing at all.
 *
 * Gated on NEXT_PUBLIC_CLARITY_ID the same way Google Analytics is: with no
 * id — preview builds, local development — this renders null and no Microsoft
 * script is fetched. A preview deployment recording sessions into the real
 * project would put pages nobody shipped into the shop's own numbers.
 *
 * The snippet loads the recorder asynchronously by itself, so it never
 * competes with the page for the network — the same property that lets the
 * GA tag sit here without costing the critical path this shop spent a day
 * clearing.
 */
export function Clarity() {
  const id = process.env.NEXT_PUBLIC_CLARITY_ID;
  // Consent first, and consent means BEFORE the script is fetched. An
  // unanswered banner and a refusal both render nothing at all — see
  // lib/consent.ts for why "load it and switch it off" is not the same thing.
  const consent = useConsent();
  if (!id || consent !== "granted") return null;

  // A plain inline script rather than next/script, for the same reason the
  // gtag config is one: with strategy="afterInteractive" Next injects inline
  // code from the client bundle, which leaves nothing in the HTML to check
  // for from outside and no guaranteed order. Clarity's snippet appends its
  // own async <script>, so being in the document costs a function call and no
  // network — the recorder still loads out of band.
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${id}");`,
      }}
    />
  );
}
