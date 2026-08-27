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
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from "@/lib/site";
import "./globals.css";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  variable: "--font-sans",
  display: "swap",
});



// Google will not show a store's name, logo, contact details or sitelinks
// search box unless the page states them in a form it parses, and none of
// that was on the page in any form. Emitted once from the root layout so
// every page carries it.
const ORGANIZATION_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Store",
  name: SITE_NAME,
  description: SITE_DESCRIPTION,
  url: SITE_URL,
  logo: `${SITE_URL}/brand/logo.png`,
  image: `${SITE_URL}/brand/logo.png`,
  telephone: "+972-4-6639510",
  areaServed: "IL",
  currenciesAccepted: "ILS",
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
    },
    "query-input": "required name=search_term_string",
  },
};

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
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <script
          type="application/ld+json"
          // JSON.stringify of an object literal we author — no external input
          // reaches this string.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ORGANIZATION_JSON_LD) }}
        />
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
            <CartDrawer />
            <CompareTray />
            <AlfredChatWidget />
            <Toaster position="top-center" richColors />
          </TooltipProvider>
        </DirectionProvider>
      </body>
    </html>
  );
}
