import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      {/* pb-16 below sm: is the phone's bottom tab bar (MobileBottomNav),
          so the last thing on a page is never under it. */}
      <main id="main-content" className="flex-1 pb-16 sm:pb-0">{children}</main>
      <Footer />
    </>
  );
}
