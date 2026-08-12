import Link from "next/link";
import { Heart, MapPin, Phone, Tag, Truck, User } from "lucide-react";
import { SearchBar } from "@/components/layout/search-bar";
import { MegaMenu } from "@/components/layout/mega-menu";
import { MobileNav } from "@/components/layout/mobile-nav";
import { CartTrigger } from "@/components/cart/cart-trigger";
import { getSession } from "@/lib/auth";

export async function Header() {
  const session = await getSession();

  return (
    <header className="bg-background sticky top-0 z-30 border-b">
      <div className="text-muted-foreground bg-secondary/60 hidden justify-center border-b py-1.5 text-xs md:flex">
        <div className="flex w-full max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <Truck className="size-3.5" /> משלוח עד הבית בכל הארץ
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="size-3.5" /> סניפים
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/deals" className="hover:text-brand flex items-center gap-1">
              <Tag className="size-3.5" /> מבצעים
            </Link>
            <Link href="/track-order" className="hover:text-brand flex items-center gap-1">
              <Truck className="size-3.5" /> מעקב הזמנה
            </Link>
            <a href="tel:04-6639510" className="hover:text-brand flex items-center gap-1">
              <Phone className="size-3.5" /> 04-6639510
            </a>
          </div>
        </div>
      </div>

      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
        <MobileNav />

        <Link href="/" className="shrink-0">
          <span className="text-2xl font-black tracking-tight">
            <span className="text-brand">P</span>REC
          </span>
        </Link>

        <div className="hidden flex-1 sm:block">
          <SearchBar />
        </div>

        <div className="flex items-center gap-1">
          <Link
            href={session ? "/account/favorites" : "/login"}
            aria-label="מועדפים"
            className="hover:bg-muted hidden size-10 items-center justify-center rounded-full transition-colors sm:flex"
          >
            <Heart className="size-5" />
          </Link>
          <Link
            href={session ? "/account" : "/login"}
            className="hover:bg-muted flex h-10 items-center gap-2 rounded-full px-2 transition-colors sm:px-3"
          >
            <User className="size-5" />
            <span className="hidden text-sm font-medium sm:inline">
              {session ? session.name.split(" ")[0] : "התחברות"}
            </span>
          </Link>
          <CartTrigger />
        </div>
      </div>

      <div className="px-4 pb-3 sm:hidden">
        <SearchBar />
      </div>

      <MegaMenu />
    </header>
  );
}
