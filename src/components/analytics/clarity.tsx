"use client";

import Script from "next/script";
import { installClarity } from "@/lib/analytics/clarity";
import { useConsent } from "@/lib/consent";
import { useIsNativeApp } from "@/lib/native-app";


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
  /* And not in the app, at any consent — the same rule as the Meta pixel, for
     a narrower reason. Clarity is session replay rather than advertising, but
     Microsoft documents it as able to set MUID, which is their cross-site
     identifier and is used for advertising among other things. That is a
     cookie this codebase does not control and cannot enumerate, and the App
     Store answer has to say plainly that no cookie in the app is used for
     tracking. Leaving it out of the app makes that sentence true by
     construction rather than by trusting a third party's defaults.

     Google Analytics deliberately stays. It sets a first-party cookie only,
     the property is not linked to Google Ads, and Google Signals is off — so
     nothing it collects becomes an advertising audience. */
  const inApp = useIsNativeApp();
  if (!id || consent !== "granted" || inApp) return null;

  /* The queue stub, during render, before the tag element below exists.
     Not from an effect, and not from an inline <script>.

     This file used to say the stub was unnecessary — "the tag file defines
     window.clarity itself, so the stub was only ever there to catch calls".
     It does not, and the consequence was total: clarity.ms/tag/{id} is a
     726-byte bootstrap whose third statement reads `a[c].v||a[c].t`, where
     `a[c]` is window.clarity. With nothing there it threw
     `Cannot read properties of undefined (reading 'v')` on every page load
     and stopped before the statement that appends the recorder. No
     clarity.js, no cookie, no upload, and a dashboard that recorded zero
     sessions for as long as this has been installed — the failure looked
     exactly like a quiet month, because a tag that 200s and then throws
     reports nothing and complains to nobody.

     From script rather than from an inline <script> for the reason
     meta-pixel.tsx records at length: this component does not exist at parse
     time. It mounts when consent is granted, and a script element React
     creates at that point does not reliably execute. The pixel lost its
     events to exactly that.

     lib/analytics/clarity.ts has the shape and why; npm run check:clarity
     runs Microsoft's real tag source against this stub, and against its
     absence. */
  installClarity(window);

  return (
    <Script
      id="clarity-tag"
      src={`https://www.clarity.ms/tag/${id}`}
      strategy="afterInteractive"
    />
  );
}
