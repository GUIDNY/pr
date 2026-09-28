"use client";

import { Gamepad2 } from "lucide-react";
import { useIsNativeApp } from "@/lib/native-app";

/**
 * The footer's way into the 3D mall.
 *
 * On the web it opens the game's own address in a new tab, as it always has.
 * Inside the iOS app a new tab is not a tab: the WebView hands anything with
 * target="_blank", and any host other than buytoday.co.il, to Safari, and the
 * customer is out of the app. So in the app the link stays in the same view
 * and goes to /mall, the shop's own address for the game (see the rewrite in
 * next.config.ts). The utm_source tells the two apart in analytics.
 *
 * useIsNativeApp answers false on the server and corrects itself on hydration,
 * so the first paint is the web link and the app swaps it before anybody can
 * tap it.
 */
export function MallLink() {
  const inApp = useIsNativeApp();
  const className =
    "bg-brand text-brand-foreground hover:bg-brand-hover mt-4 inline-flex items-center gap-2 rounded-full py-2 ps-3 pe-4 text-sm font-semibold transition-colors";
  const content = (
    <>
      <Gamepad2 aria-hidden className="size-4" />
      הקניון התלת־ממדי שלנו
    </>
  );
  if (inApp) {
    return (
      <a href="/mall?utm_source=app&utm_medium=footer&utm_campaign=3d-mall" className={className}>
        {content}
      </a>
    );
  }
  return (
    <a
      href="https://play.buytoday.co.il/?utm_source=buytoday&utm_medium=footer&utm_campaign=3d-mall"
      target="_blank"
      rel="noopener"
      className={className}
    >
      {content}
    </a>
  );
}
