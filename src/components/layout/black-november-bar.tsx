"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { formatPrice } from "@/lib/format";
import {
  BLACK_NOVEMBER_TERMS_HREF,
  BLACK_NOVEMBER_TERMS_TEXT,
  BLACK_NOVEMBER_UNTIL,
} from "@/lib/campaigns/black-november";

/**
 * One line under the top strip, on every page of the shop, that says the
 * campaign exists and goes there.
 *
 * Why (20 November): most visitors land straight on a product page — from
 * ChatGPT, Google Shopping, an ad — and few ever see the homepage, which was
 * the one place the campaign was linked from. So the campaign was nearly
 * invisible to the people it was for.
 *
 * What it says is the campaign's own line (lib/campaigns/black-november.ts):
 * the name, how many models, the lowest price, "לזמן מוגבל". No timer, no
 * percentage, no struck-through price.
 *
 * Not on the cart and the checkout, where the only thing that should be on
 * the screen is finishing the purchase, and not on the campaign page itself.
 */
export function BlackNovemberBar({ total, lowestPrice }: { total: number; lowestPrice: number | null }) {
  const path = usePathname();
  if (total === 0) return null;
  if (path.startsWith("/checkout") || path.startsWith("/cart") || path.startsWith("/black-november")) return null;

  return (
    <div
      data-site-chrome
      className="border-brand flex justify-center border-b-2 bg-black px-3 py-2 text-[12px] text-white sm:text-sm"
    >
      <div className="flex w-full max-w-7xl flex-wrap items-center justify-center gap-x-2 gap-y-0.5">
        <Link href="/black-november" className="flex items-center gap-2 whitespace-nowrap hover:underline">
          <span className="font-black">בלאק נובמבר</span>
          <span className="text-white/80">
            · {total.toLocaleString("he-IL")} דגמים
            {lowestPrice ? <span className="hidden sm:inline"> · מ־{formatPrice(lowestPrice)}</span> : null}
          </span>
          <span className="text-brand inline-flex items-center gap-0.5 font-bold">
            לכל הדגמים
            <ArrowLeft className="size-4" />
          </span>
        </Link>
        <span className="text-white/80">
          · {BLACK_NOVEMBER_UNTIL} ·{" "}
          <Link href={BLACK_NOVEMBER_TERMS_HREF} className="underline underline-offset-2 hover:no-underline">
            {BLACK_NOVEMBER_TERMS_TEXT}
          </Link>
        </span>
      </div>
    </div>
  );
}
