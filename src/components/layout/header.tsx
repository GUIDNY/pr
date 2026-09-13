import Image from "next/image";
import Link from "next/link";
import { MapPin, Phone, ShieldCheck, Tag, Truck } from "lucide-react";
import { BUSINESS } from "@/lib/business";
import { SearchBar } from "@/components/layout/search-bar";
import { MegaMenu } from "@/components/layout/mega-menu";
import { MobileNav } from "@/components/layout/mobile-nav";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { CartTrigger } from "@/components/cart/cart-trigger";
import { AccountButton } from "@/components/layout/account-button";
import { FavoritesLink } from "@/components/layout/favorites-link";
import { BackOfficeLink } from "@/components/layout/back-office-link";
import { getNavigableCategoryTree } from "@/lib/queries/categories";

export async function Header() {
  // Deliberately no visitor lookup here. This header is on every page in the
  // shop, and identifying the visitor made every one of those pages
  // uncacheable — a server cannot prepare a page in advance for someone it
  // has to recognise first. Googlebot, which always arrives cold, paid 2.4
  // seconds for a greeting. AccountButton fills it in from the browser.
  const departments = await getNavigableCategoryTree();

  return (
    <>
      {/* Navy, and on every width. The strip used to be a grey line that
          phones never saw, and a phone is where most visitors decide in a
          second whether this is a real shop: the importer warranty, delivery
          and a phone number are that second's worth of evidence, so they are
          the first thing on the screen at every size. Outside the sticky
          header on purpose: it is read once, at the top, and should not
          spend a strip of every screen afterwards. */}
      <div className="bg-primary text-primary-foreground/85 flex justify-center py-1.5 text-[11px] sm:text-xs">
        <div className="flex w-full max-w-7xl items-center justify-center gap-3 px-4 sm:gap-4 md:justify-between">
          <div className="flex items-center gap-3 whitespace-nowrap sm:gap-4">
            <span className="flex items-center gap-1">
              <ShieldCheck className="text-brand size-3.5" /> <span className="hidden sm:inline">אחריות </span>יבואן רשמי
            </span>
            <span className="flex items-center gap-1">
              <Truck className="text-brand size-3.5" /> משלוח חינם מעל ₪500
            </span>
            <Link href="/page/branches" className="hover:text-primary-foreground hidden items-center gap-1 md:flex">
              <MapPin className="size-3.5" /> חנות בחדרה
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/deals" className="hover:text-primary-foreground hidden items-center gap-1 md:flex">
              <Tag className="size-3.5" /> מבצעים
            </Link>
            <Link href="/track-order" className="hover:text-primary-foreground hidden items-center gap-1 md:flex">
              <Truck className="size-3.5" /> מעקב הזמנה
            </Link>
            {/* On a phone the number lives one tap away in the drawer and
                on the product page; three facts in one 390px line wrapped
                to two, and a strip that wraps is a strip that shouts. */}
            <a href={BUSINESS.phoneHref} className="hover:text-primary-foreground hidden items-center gap-1 font-medium whitespace-nowrap sm:flex">
              <Phone className="size-3.5" /> {BUSINESS.phone}
            </a>
            {/* Staff only, and empty for everyone else — see BackOfficeLink. */}
            <BackOfficeLink />
          </div>
        </div>
      </div>

      <header className="bg-background sticky top-0 z-30 border-b">
        {/* Phone: one row, 56px, and that is the whole sticky header —
            menu, the mark, the search field, the cart. It was three rows
            and 200px, a quarter of the screen pinned in place. Account and
            favourites live in the menu drawer on a phone. */}
        <div className="flex items-center gap-2 px-3 py-2 sm:hidden">
          <MobileNav departments={departments} />
          <Link href="/" aria-label="Buy Today — לדף הבית" className="shrink-0">
            <Image src="/brand/logo.png" alt="" width={512} height={512} priority className="size-9 rounded-[22%]" />
          </Link>
          <div className="min-w-0 flex-1">
            <SearchBar inputClassName="border-brand/40 focus-visible:border-brand h-10 border-2" />
          </div>
          <CartTrigger />
        </div>

        {/* Desktop: the mark with its name, a wide search field, the icons. */}
        <div className="mx-auto hidden max-w-7xl items-center gap-3 px-4 py-3 sm:flex">
          <MobileNav departments={departments} />

          {/* The tile carries the wordmark, but at 44px it is a mark, not a
              name. The name and what the shop is sit beside it in readable
              type — a visitor who has never heard of Buy Today should not
              have to squint at a tile to learn that this is an appliance
              importer. */}
          <Link href="/" aria-label="Buy Today — לדף הבית" className="flex shrink-0 items-center gap-2.5">
            <Image
              src="/brand/logo.png"
              alt=""
              width={512}
              height={512}
              priority
              className="size-11 shrink-0 rounded-[22%]"
            />
            <span className="flex flex-col leading-none">
              <span className="text-lg font-black tracking-tight">Buy Today</span>
              <span className="text-muted-foreground mt-1 text-[11px] font-medium">מוצרי חשמל · יבואן רשמי</span>
            </span>
          </Link>

          {/* A bold, brand-edged field rather than a hairline one: the
              search box is the thing a visitor with a model number in hand
              looks for first, and it should be found without looking. */}
          <div className="flex-1">
            <SearchBar inputClassName="border-brand/40 focus-visible:border-brand h-11 border-2 shadow-sm" />
          </div>

          <div className="flex items-center gap-1">
            <FavoritesLink />
            {/* Looks different signed in and signed out — see AccountButton. */}
            <AccountButton />
            <CartTrigger />
          </div>
        </div>

        <MegaMenu departments={departments} />
      </header>

      <MobileBottomNav departments={departments} />
    </>
  );
}
