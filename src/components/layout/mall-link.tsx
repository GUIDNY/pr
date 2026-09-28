"use client";

import { useState, useSyncExternalStore } from "react";
import { Gamepad2 } from "lucide-react";
/* Per icon, as in the footer: the package root re-exports thousands. */
import SiApple from "@icons-pack/react-simple-icons/icons/SiApple";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useIsNativeApp } from "@/lib/native-app";
import { APP_STORE_URL, mallHref } from "@/lib/mall";
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
 * The header's way into the mall — in the app, and on the web too.
 *
 * In the app it goes straight to /mall, in the same view: the app has no
 * address bar and a footer few people scroll to, so this is the door.
 *
 * On the web the same tile sits in the header, but on an iPhone or iPad it
 * asks first. The mall is at its best inside the app (full screen, no
 * browser bars, the customer's cart and account already there), and an
 * iPhone visitor who is interested enough to tap a 3D mall is exactly who
 * the App Store link is for. So it opens a sheet with the two ways in: get
 * the app, or go in right now in the browser. Anywhere else there is no app
 * to offer (the shop ships iOS only), so it is a plain link to the game in
 * a new tab.
 *
 * Sized to sit in the phone row without squeezing the search field on a
 * 320px phone: a 40px tile, the same height as the field beside it, with the
 * word under the icon rather than beside it so it costs no extra width.
 * shrink-0 so it is the search field, not the button, that gives way.
 *
 * Which of the three it is can only be known in the browser, so the server
 * renders the web link and hydration swaps it — the same pattern as
 * useIsNativeApp.
 */
const TILE =
  "bg-brand/10 text-brand hover:bg-brand/15 flex h-10 w-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg transition-colors";

function TileFace() {
  return (
    <>
      <Gamepad2 aria-hidden className="size-[18px]" strokeWidth={2.25} />
      <span className="text-[10px] leading-none font-bold">קניון</span>
    </>
  );
}

function subscribeNothing() {
  return () => {};
}
/** iPhone, iPod, or an iPad (which reports itself as a Mac with a touch screen). */
function isAppleMobile(): boolean {
  const ua = window.navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && window.navigator.maxTouchPoints > 1);
}

export function HeaderMallButton({ className }: { className?: string }) {
  const inApp = useIsNativeApp();
  const appleMobile = useSyncExternalStore(subscribeNothing, isAppleMobile, () => false);
  const [open, setOpen] = useState(false);

  if (inApp) {
    return (
      <a href={mallHref("header", true)} aria-label="הקניון התלת־ממדי" className={cn(TILE, className)}>
        <TileFace />
      </a>
    );
  }

  if (!appleMobile) {
    return (
      <a
        href={mallHref("header", false)}
        target="_blank"
        rel="noopener"
        aria-label="הקניון התלת־ממדי (נפתח בלשונית חדשה)"
        className={cn(TILE, className)}
      >
        <TileFace />
      </a>
    );
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button type="button" aria-label="הקניון התלת־ממדי" className={cn(TILE, className)}>
          <TileFace />
        </button>
      </SheetTrigger>
      {/* z-[60]: above the cookie bar (z-[55]), which a first-time visitor
          still has open and which would otherwise sit over both buttons. */}
      <SheetContent side="bottom" className="z-[60] mx-auto max-w-md gap-0 rounded-t-3xl px-5 pt-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <SheetHeader className="p-0 text-start">
          <span className="text-brand flex items-center gap-1.5 text-xs font-bold">
            <Gamepad2 aria-hidden className="size-4" />
            משחק · קניון תלת־ממדי
          </span>
          <SheetTitle className="text-xl font-black">הקניון התלת־ממדי של BuyToday</SheetTitle>
          <SheetDescription>
            מטיילים בין המחלקות, רואים מבצעים ומוצרים אמיתיים, ונכנסים עם הדמות שלכם.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-5 flex flex-col gap-2.5">
          <a
            href={APP_STORE_URL}
            onClick={() => setOpen(false)}
            className="bg-primary text-primary-foreground flex h-14 items-center justify-center gap-3 rounded-2xl px-4 font-bold shadow-sm transition-opacity hover:opacity-90"
          >
            <SiApple aria-hidden className="size-5" />
            <span className="flex flex-col items-start leading-tight">
              <span className="text-[15px]">הורדת האפליקציה</span>
              <span className="text-primary-foreground/70 text-[11px] font-medium">הקניון במסך מלא, עם העגלה והחשבון שלכם</span>
            </span>
          </a>
          <a
            href={mallHref("header", false)}
            target="_blank"
            rel="noopener"
            onClick={() => setOpen(false)}
            className="bg-brand text-brand-foreground hover:bg-brand-hover flex h-14 items-center justify-center gap-2 rounded-2xl px-4 text-[15px] font-bold shadow-sm transition-colors"
          >
            <Gamepad2 aria-hidden className="size-5" />
            כניסה לקניון בדפדפן
          </a>
        </div>
      </SheetContent>
    </Sheet>
  );
}
