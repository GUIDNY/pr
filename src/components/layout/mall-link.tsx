"use client";

import { Gamepad2 } from "lucide-react";
import { useIsNativeApp } from "@/lib/native-app";
import { mallHref } from "@/lib/mall";
import { cn } from "@/lib/utils";

/**
 * Any link into the 3D mall.
 *
 * On the web it opens the game's own address in a new tab, as the footer
 * always has. Inside the iOS app a new tab is not a tab: the WebView hands
 * anything with target="_blank", and any host other than buytoday.co.il, to
 * Safari, and the customer is out of the app. So in the app the link stays in
 * the same view and goes to /mall, the shop's own address for the game (see
 * the rewrite in next.config.ts). The utm_source tells the two apart in
 * analytics and `medium` says which entrance it was — see mallHref.
 *
 * useIsNativeApp answers false on the server and corrects itself on
 * hydration, so the first paint is the web link and the app swaps it before
 * anybody can tap it.
 */
export function MallAnchor({
  medium,
  className,
  children,
  "aria-label": ariaLabel,
}: {
  medium: string;
  className?: string;
  children: React.ReactNode;
  "aria-label"?: string;
}) {
  const inApp = useIsNativeApp();
  const href = mallHref(medium, inApp);
  if (inApp) {
    return (
      <a href={href} className={className} aria-label={ariaLabel}>
        {children}
      </a>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener" className={className} aria-label={ariaLabel}>
      {children}
    </a>
  );
}

/** The footer's way into the mall. */
export function MallLink() {
  return (
    <MallAnchor
      medium="footer"
      className="bg-brand text-brand-foreground hover:bg-brand-hover mt-4 inline-flex items-center gap-2 rounded-full py-2 ps-3 pe-4 text-sm font-semibold transition-colors"
    >
      <Gamepad2 aria-hidden className="size-4" />
      הקניון התלת־ממדי שלנו
    </MallAnchor>
  );
}

/**
 * The header's way into the mall — in the app only.
 *
 * The app has no address bar to type play.buytoday.co.il into and a footer
 * few people scroll to, so without this the mall is barely in the app at
 * all. On the web the footer link and the homepage card are enough, and the
 * phone header's single row is already the menu, the mark and the search
 * field; it renders nothing there.
 *
 * Sized to sit in that row without squeezing the search field on a 320px
 * phone: a 40px tile, the same height as the field beside it, with the word
 * under the icon rather than beside it so it costs no extra width. shrink-0
 * so it is the search field, not the button, that gives way.
 */
export function HeaderMallButton({ className }: { className?: string }) {
  const inApp = useIsNativeApp();
  if (!inApp) return null;
  return (
    <a
      href={mallHref("header", true)}
      aria-label="הקניון התלת־ממדי"
      className={cn(
        "bg-brand/10 text-brand hover:bg-brand/15 flex h-10 w-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg transition-colors",
        className,
      )}
    >
      <Gamepad2 aria-hidden className="size-[18px]" strokeWidth={2.25} />
      <span className="text-[10px] leading-none font-bold">קניון</span>
    </a>
  );
}
