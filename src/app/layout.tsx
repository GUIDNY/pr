import type { Metadata } from "next";
import { Suspense } from "react";
import { Heebo } from "next/font/google";
import { DirectionProvider } from "@/components/ui/direction";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { CartProvider } from "@/components/cart/cart-provider";
import { CartDrawer } from "@/components/cart/cart-drawer";
import { CompareTray } from "@/components/product/compare-tray";
import { AlfredChatWidget } from "@/components/alfred-chat/alfred-chat-widget";
import { AccessibilityWidget } from "@/components/layout/accessibility-widget";
import { CookieNotice } from "@/components/layout/cookie-notice";
import { ShoppingOnly } from "@/components/layout/shopping-only";
import "./globals.css";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  variable: "--font-sans",
  display: "swap",
});

const SITE_URL = "https://pr-ayam.vercel.app";
const SITE_NAME = "A&I Electronics";
const SITE_DESCRIPTION =
  "A&I Electronics - חנות מוצרי חשמל, אלקטרוניקה וקולנוע ביתי. מקררים, מכונות כביסה, טלוויזיות ועוד, עם משלוח עד הבית ואחריות יבואן רשמי.";

export const metadata: Metadata = {
  // Required for the Open Graph image to resolve to an absolute URL. Without
  // it Next emits a relative path, and every crawler that matters — WhatsApp,
  // Facebook, X, iMessage — silently drops the image and shows a bare link.
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} - הדרך החכמה לקנות אלקטרוניקה`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  // The icon set is picked up by convention from src/app: icon.png for the
  // browser tab, apple-icon.png for an iOS home-screen shortcut. Both are
  // generated from public/brand/logo.png.
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "he_IL",
    url: SITE_URL,
    title: `${SITE_NAME} - הדרך החכמה לקנות אלקטרוניקה`,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} - הדרך החכמה לקנות אלקטרוניקה`,
    description: SITE_DESCRIPTION,
  },
};

// Kept in step with applySettings() in accessibility-widget.tsx by hand — it has
// to be a plain string so it can run before any bundle is fetched.
const A11Y_BOOT_SCRIPT = `(function(){try{var s=JSON.parse(localStorage.getItem("prec-a11y")||"{}");var r=document.documentElement;if(s.fontScale)r.style.setProperty("--a11y-font-scale",String(s.fontScale));var c={contrast:"a11y-contrast",dark:"dark",invert:"a11y-invert",grayscale:"a11y-grayscale"}[s.colorMode];if(c)r.classList.add(c);var t={readableFont:"a11y-readable-font",spacing:"a11y-spacing",highlightLinks:"a11y-links",highlightTitles:"a11y-titles",bigCursor:"a11y-big-cursor",stopAnimations:"a11y-no-motion",focusHighlight:"a11y-focus"};for(var k in t){if(s[k])r.classList.add(t[k])}}catch(e){}})()`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="he"
      dir="rtl"
      data-scroll-behavior="smooth"
      className={`${heebo.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Applies the visitor's stored accessibility choices while the browser
            is still parsing the HTML. Doing it in an effect instead would paint
            the default palette first, so someone who needs high contrast or a
            larger font would get a flash of the version they can't read on
            every single page load. */}
        <script dangerouslySetInnerHTML={{ __html: A11Y_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <a
          href="#main-content"
          className="bg-brand text-brand-foreground focus:top-2 focus:start-2 pointer-events-none absolute -top-full start-2 z-50 rounded-md px-4 py-2 text-sm font-medium focus:pointer-events-auto focus:top-2"
        >
          דלג לתוכן מרכזי
        </a>
        <DirectionProvider dir="rtl">
          <TooltipProvider delayDuration={150}>
            <Suspense fallback={null}>
              <CartProvider />
            </Suspense>
            {children}
            {/* Browsing furniture. Hidden on the payment step — see ShoppingOnly. */}
            <ShoppingOnly>
              <CartDrawer />
              <CompareTray />
              <AlfredChatWidget />
            </ShoppingOnly>
            <AccessibilityWidget />
            <CookieNotice />
            <Toaster position="top-center" richColors />
          </TooltipProvider>
        </DirectionProvider>
      </body>
    </html>
  );
}
