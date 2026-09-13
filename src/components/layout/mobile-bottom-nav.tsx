"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Home, ShoppingCart, User } from "lucide-react";
import { MobileNav } from "@/components/layout/mobile-nav";
import { useCartStore } from "@/stores/cart-store";
import { useAccountName } from "@/components/layout/session-summary-provider";
import { showsBottomNav, ALFRED_OPEN_EVENT } from "@/lib/bottom-nav";
import type { NavigableDepartment } from "@/lib/queries/categories";
import { cn } from "@/lib/utils";

/**
 * The phone's tab bar: home, departments, Alfred, cart, account.
 *
 * The shape every shopping app a phone already has uses, and for the
 * reason they all use it: the bottom of the screen is where a thumb rests,
 * so the five things a shopper reaches for most often sit there, always,
 * without scrolling back up. It also retires two floating bubbles on the
 * pages it shows on — Alfred becomes a tab, and the cart is a tab rather
 * than a header icon a thumb cannot reach.
 */
export function MobileBottomNav({ departments }: { departments: NavigableDepartment[] }) {
  const pathname = usePathname();
  const itemCount = useCartStore((s) => s.cart.itemCount);
  const toggleDrawer = useCartStore((s) => s.toggleDrawer);
  const name = useAccountName();

  if (!showsBottomNav(pathname)) return null;

  const tab =
    "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-medium transition-colors";
  const isHome = pathname === "/";

  return (
    <nav
      aria-label="ניווט ראשי"
      className="floating-launcher border-border bg-background/95 fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgb(0_0_0/0.06)] backdrop-blur sm:hidden"
    >
      <div className="flex h-14 items-stretch px-1">
        <Link href="/" className={cn(tab, isHome ? "text-brand" : "text-muted-foreground")}>
          <Home className="size-5" strokeWidth={isHome ? 2.25 : 1.75} />
          בית
        </Link>

        <MobileNav departments={departments} variant="tab" />

        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(ALFRED_OPEN_EVENT))}
          className={cn(tab, "text-muted-foreground")}
        >
          <span className="ring-brand/40 relative -mt-3 flex size-11 items-center justify-center rounded-full bg-white shadow-md ring-2">
            <Image src="/mascot/alfred-chat.png" alt="" width={44} height={44} className="size-full rounded-full object-cover" />
          </span>
          אלפרד
        </button>

        <button type="button" onClick={toggleDrawer} className={cn(tab, "text-muted-foreground relative")}>
          <span className="relative">
            <ShoppingCart className="size-5" strokeWidth={1.75} />
            {itemCount > 0 && (
              <span className="bg-brand text-brand-foreground absolute -top-1.5 -end-2 flex size-4 items-center justify-center rounded-full text-[10px] font-bold tabular-nums">
                {itemCount > 9 ? "9+" : itemCount}
              </span>
            )}
          </span>
          עגלה
        </button>

        <Link
          href="/account"
          className={cn(tab, pathname.startsWith("/account") ? "text-brand" : "text-muted-foreground")}
        >
          {name ? (
            <span className="bg-brand text-brand-foreground grid size-5 place-items-center rounded-full text-[11px] font-bold">
              {name.trim().charAt(0)}
            </span>
          ) : (
            <User className="size-5" strokeWidth={1.75} />
          )}
          חשבון
        </Link>
      </div>
    </nav>
  );
}
