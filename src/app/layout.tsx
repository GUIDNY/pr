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
import "./globals.css";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "A&I Electronics - הדרך החכמה לקנות אלקטרוניקה",
    template: "%s | A&I Electronics",
  },
  description:
    "A&I Electronics - חנות מוצרי חשמל, אלקטרוניקה וקולנוע ביתי. מקררים, מכונות כביסה, טלוויזיות ועוד, עם משלוח עד הבית ואחריות יבואן רשמי.",
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
