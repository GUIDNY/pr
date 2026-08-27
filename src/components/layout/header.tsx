import Image from "next/image";
import Link from "next/link";
import { Heart, MapPin, Phone, Tag, Truck, User } from "lucide-react";
import { SearchBar } from "@/components/layout/search-bar";
import { MegaMenu } from "@/components/layout/mega-menu";
import { MobileNav } from "@/components/layout/mobile-nav";
import { CartTrigger } from "@/components/cart/cart-trigger";
import { getSession } from "@/lib/auth";
import { getNavigableCategoryTree } from "@/lib/queries/categories";

export async function Header() {
  const [session, departments] = await Promise.all([getSession(), getNavigableCategoryTree()]);

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

      {/* Grid only below sm: (three tracks so the logo can sit truly
          centered regardless of how wide the hamburger/icons columns end up
          being) — sm: switches back to the exact flex row this always was,
          so desktop's layout/order is untouched. The hidden search-bar
          wrapper takes no grid track since `hidden` elements don't
          participate in grid placement. */}
      <div className="mx-auto grid max-w-7xl grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-2 sm:flex sm:py-3">
        <MobileNav departments={departments} />

        {/* The logo tile plus the wordmark beside it. The tile already
            contains the name, but at header height its own "ELECTRONICS"
            line is only a few pixels tall and reads as texture rather than
            text — so the wordmark carries the name and the tile carries the
            recognition. dir="ltr" on the row: the page is RTL, and without
            it the two Latin parts order right-to-left and the brand reads
            "Electronics A&I". */}
        <Link
          href="/"
          dir="ltr"
          aria-label="A&I Electronics — לדף הבית"
          className="flex shrink-0 items-center gap-2 justify-self-center sm:justify-self-auto"
        >
          <Image
            src="/brand/logo.png"
            alt=""
            width={512}
            height={512}
            priority
            className="size-9 shrink-0 rounded-[22%] sm:size-10"
          />
          <span aria-hidden className="flex flex-col leading-none font-black tracking-tight">
            <span className="text-brand text-lg sm:text-xl">A&I</span>
            <span className="text-[0.7rem] tracking-[0.14em] sm:text-[0.8rem]">ELECTRONICS</span>
          </span>
        </Link>

        <div className="hidden flex-1 sm:block">
          <SearchBar />
        </div>

        <div className="flex items-center gap-1 justify-self-end sm:justify-self-auto">
          <Link
            href={session ? "/account/favorites" : "/login"}
            aria-label="מועדפים"
            className="hover:bg-muted hidden size-10 items-center justify-center rounded-full transition-colors sm:flex"
          >
            <Heart className="size-5" />
          </Link>
          <Link
            href={session ? "/account" : "/login"}
            className="hover:bg-muted flex h-11 min-w-11 items-center justify-center gap-2 rounded-full px-2 transition-colors sm:h-10 sm:min-w-0 sm:justify-start sm:px-3"
          >
            <User className="size-5" />
            <span className="hidden text-sm font-medium sm:inline">
              {session ? session.name.split(" ")[0] : "התחברות"}
            </span>
          </Link>
          <CartTrigger />
        </div>
      </div>

      <div className="px-4 pb-2.5 sm:hidden">
        <SearchBar inputClassName="h-11 rounded-2xl" />
      </div>

      <MegaMenu departments={departments} />
    </header>
  );
}
