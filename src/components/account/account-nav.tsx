"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gift, Heart, KeyRound, LayoutDashboard, MapPin, Package, Trash2, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS = { overview: LayoutDashboard, orders: Package, club: Trophy, addresses: MapPin, favorites: Heart, password: KeyRound, gifts: Gift };
export type AccountNavItem = { href: string; label: string; icon: keyof typeof ICONS };

/** Is this item the page being looked at? The overview only on itself; the rest on their subpages too. */
function isActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  return href === "/account" ? pathname === "/account" : pathname === href || pathname.startsWith(`${href}/`);
}

/** The personal area's menu: a column beside the page from lg, a row of tabs above it on a phone. */
export function AccountNav({ items }: { items: AccountNavItem[] }) {
  const pathname = usePathname();
  return (
    <>
      {/* phone and tablet: tabs that scroll sideways */}
      <nav aria-label="תפריט האזור האישי" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden">
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors",
                active ? "border-brand bg-brand text-brand-foreground" : "border-border bg-card hover:border-brand/40",
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* desktop: the column */}
      <nav aria-label="תפריט האזור האישי" className="hidden flex-col gap-0.5 lg:flex">
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                active ? "bg-brand/10 text-brand font-bold" : "text-foreground/80 hover:bg-muted hover:text-foreground",
              )}
            >
              {active && <span aria-hidden className="bg-brand absolute inset-y-2 start-0 w-1 rounded-full" />}
              <Icon className="size-[18px]" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

export function AccountDeleteLink() {
  return (
    <Link href="/account/delete" className="text-muted-foreground hover:bg-muted flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium">
      <Trash2 className="size-[18px] shrink-0" />
      <span className="flex flex-col items-start leading-tight">
        מחיקת החשבון
        {/* App Store 5.1.1(v): the reviewer looks for account deletion here and does not read Hebrew. */}
        <span dir="ltr" className="text-muted-foreground/70 text-[11px] font-normal">
          Delete account
        </span>
      </span>
    </Link>
  );
}
