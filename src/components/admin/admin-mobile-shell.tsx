"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu,
  LayoutDashboard,
  ShoppingBag,
  Package,
  Boxes,
  ShoppingCart,
  AlertTriangle,
  Coins,
  Tag,
  TicketPercent,
  Truck,
  MessageCircle,
  Sparkles,
  GalleryHorizontal,
  CreditCard,
  MoreHorizontal,
  ChevronDown,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * The back office on a phone.
 *
 * Until 22 October the phone got the page and nothing else: the sidebar is
 * lg:-only, and the header under it carried the logo alone — no way to the
 * other screens, no way back to the shop, no way to sign out, on the device
 * an order is actually handled from. So two things a phone app has:
 *
 *   a menu — the same links the sidebar shows, in a drawer from the top
 *   bar, closed by the tap that chooses one;
 *
 *   a tab bar — the first few of those links along the bottom, where a
 *   thumb is, with "עוד" opening the drawer for the rest.
 *
 * The links themselves are rendered by the layout (a server component,
 * which is where the role decides what is listed) and handed in as
 * children; this file only knows how to show them. The tab bar needs the
 * icons here, as components cannot cross to the client, so it maps them by
 * href — a link with no icon listed gets the generic one.
 */
const ADMIN_MENU_OPEN_EVENT = "admin-menu:open";

const ICONS: Record<string, typeof Menu> = {
  "/admin": LayoutDashboard,
  "/admin/orders": ShoppingBag,
  "/admin/prices": Coins,
  "/admin/abandoned": ShoppingCart,
  "/admin/complaints": AlertTriangle,
  "/admin/products": Package,
  "/admin/inventory": Boxes,
  "/admin/deals": Tag,
  "/admin/promotions": TicketPercent,
  "/admin/suppliers": Truck,
  "/admin/chatbot": MessageCircle,
  "/admin/homepage-alfred": Sparkles,
  "/admin/banners": GalleryHorizontal,
  "/admin/pelecard-test": CreditCard,
};

export type AdminTab = { href: string; label: string; exact?: boolean };

export function AdminMenuSheet({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(ADMIN_MENU_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(ADMIN_MENU_OPEN_EVENT, onOpen);
  }, []);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="פתח תפריט ניהול"
          className="hover:bg-muted flex size-10 shrink-0 items-center justify-center rounded-full"
        >
          <Menu className="size-5" />
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-sm">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle>ממשק ניהול</SheetTitle>
        </SheetHeader>
        {/* A tap on any link closes the drawer; the link itself navigates. */}
        <div className="flex-1 overflow-y-auto" onClick={(e) => { if ((e.target as HTMLElement).closest("a, button")) setOpen(false); }}>
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function AdminTabBar({ tabs }: { tabs: AdminTab[] }) {
  const pathname = usePathname();
  const active = (t: AdminTab) => (t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(`${t.href}/`));
  return (
    <nav
      aria-label="ניווט מהיר"
      className="bg-background/95 border-border fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgb(0_0_0/0.06)] backdrop-blur lg:hidden"
    >
      {tabs.map((t) => {
        const Icon = ICONS[t.href] ?? Menu;
        const on = active(t);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium",
              on ? "text-brand" : "text-muted-foreground",
            )}
          >
            <Icon className="size-5" strokeWidth={on ? 2.25 : 1.75} />
            <span className="max-w-full truncate px-1">{t.label}</span>
          </Link>
        );
      })}
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event(ADMIN_MENU_OPEN_EVENT))}
        className="text-muted-foreground flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium"
      >
        <MoreHorizontal className="size-5" strokeWidth={1.75} />
        עוד
      </button>
    </nav>
  );
}

/**
 * "נוספים" — every screen that is not one of the five the owner uses daily,
 * folded under one heading so the menu opens on those five and nothing else.
 * It opens by itself when the page being shown is one of the folded ones, so
 * nobody lands on a screen whose link they cannot see.
 */
export function AdminMoreGroup({
  hrefs,
  tone,
  children,
}: {
  hrefs: string[];
  tone: "sidebar" | "sheet";
  children: ReactNode;
}) {
  const pathname = usePathname();
  const inside = hrefs.some((h) => pathname === h || pathname.startsWith(`${h}/`));
  const [open, setOpen] = useState(inside);
  const [seen, setSeen] = useState(pathname);
  if (seen !== pathname) {
    setSeen(pathname);
    if (inside) setOpen(true);
  }
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={cn(
          "flex items-center gap-2.5 rounded-lg px-3 text-sm font-medium transition-colors",
          tone === "sidebar" ? "hover:bg-primary-foreground/10 py-2.5" : "hover:bg-muted py-3",
        )}
      >
        <MoreHorizontal className={tone === "sidebar" ? "size-4" : "text-brand size-5"} />
        <span className="flex-1 text-start">נוספים</span>
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div
          className={cn(
            "flex flex-col gap-1 border-s-2 ps-2 ms-4",
            tone === "sidebar" ? "border-primary-foreground/15" : "border-border",
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}
