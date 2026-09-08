"use client";

import Script from "next/script";
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

  /* Clarity's published snippet is an inline script whose entire job is to
     create a queue stub and then append <script src="clarity.ms/tag/{id}">.
     It used to be inlined here, which worked while this component was part of
     the server's HTML — but consent mounts it later now, and a script element
     React inserts after hydration does not reliably execute. The Meta pixel
     failed exactly that way in production (see meta-pixel.tsx).

     Loading the tag directly is both the fix and simpler: the tag file defines
     window.clarity itself, so the stub was only ever there to catch calls made
     in the milliseconds before it arrived, and nothing in this codebase calls
     clarity at all. */
  return (
    <Script
      id="clarity-tag"
      src={`https://www.clarity.ms/tag/${id}`}
      strategy="afterInteractive"
    />
  );
}
