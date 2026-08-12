import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import { DirectionProvider } from "@/components/ui/direction";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { CartHydrator } from "@/components/cart/cart-hydrator";
import { CartDrawer } from "@/components/cart/cart-drawer";
import { CompareTray } from "@/components/product/compare-tray";
import { getCart } from "@/lib/cart";
import { buildCartSummary } from "@/lib/cart-summary";
import "./globals.css";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "PREC | פר אלקטרוניקה - מוצרי חשמל במחירים הכי טובים",
    template: "%s | PREC",
  },
  description:
    "PREC - חנות מוצרי חשמל, אלקטרוניקה וקולנוע ביתי. מקררים, מכונות כביסה, טלוויזיות ועוד, במחירים הכי טובים עם משלוח עד הבית ואחריות יבואן רשמי.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cart = await getCart();
  const cartSummary = await buildCartSummary(cart);

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
            <CartHydrator initialCart={cartSummary} />
            {children}
            <CartDrawer />
            <CompareTray />
            <Toaster position="top-center" richColors />
          </TooltipProvider>
        </DirectionProvider>
      </body>
    </html>
  );
}
