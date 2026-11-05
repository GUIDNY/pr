"use client";

import Link from "next/link";
import { ArrowLeft, Eye } from "lucide-react";
import { useBackOfficeHome } from "@/components/layout/session-summary-provider";
import { SinglesDayCountdown } from "@/components/campaign/countdown";

/**
 * The homepage's way in to /singles-day — for catalog managers only, until
 * the campaign is opened to everyone.
 *
 * Decided in the browser, not on the server, on purpose: the homepage is
 * built once and cached at the edge for every visitor (revalidate = 300),
 * and reading a session there would make it render per request for all of
 * them. The session summary already answers "is this a manager" after the
 * page is on screen — backOffice is "/admin" for exactly the roles
 * canManageCatalog admits, the same gate the page itself uses — so the
 * banner simply appears once that answer arrives.
 *
 * Nothing here may come from the server: anything passed as a prop would be
 * in the cached HTML every visitor downloads. The text is fixed and carries
 * no price, cost or product, and the page it links to 404s for anyone else.
 */
export function AdminSinglesDayBanner() {
  const backOffice = useBackOfficeHome();
  if (backOffice !== "/admin") return null;
  return <SinglesDayHomeBanner />;
}

export function SinglesDayHomeBanner({ initialNow }: { initialNow?: number }) {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-4">
      <Link
        href="/singles-day"
        className="group relative block overflow-hidden rounded-2xl bg-[#f6f0e6] text-neutral-950 shadow-[0_1px_2px_rgb(0_0_0/0.05),0_0_0_1px_rgb(0_0_0/0.06)] transition hover:shadow-[0_10px_30px_-10px_rgb(60_40_10/0.35),0_0_0_1px_rgb(0_0_0/0.08)]"
      >
        {/* the four ones, outlined, as on the page itself */}
        <span
          aria-hidden
          dir="ltr"
          className="pointer-events-none absolute -bottom-6 left-0 select-none text-[9rem] font-black leading-none tracking-[-0.05em] text-transparent [-webkit-text-stroke:1.5px_rgb(0_0_0/0.10)] sm:-bottom-10 sm:text-[13rem]"
        >
          11.11
        </span>

        <span className="absolute top-0 end-0 flex items-center gap-1 rounded-es-xl bg-amber-300 px-2.5 py-1 text-[11px] font-bold">
          <Eye className="size-3.5" /> מנהלים בלבד
        </span>

        <div className="relative flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-8 sm:p-6">
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-neutral-600">
              <span className="bg-neutral-950 px-1.5 py-0.5 font-mono tracking-[0.15em] text-white">11.11</span>
              יום אחד · עד גמר המלאי
            </div>
            <div className="text-3xl font-black leading-none tracking-tight sm:text-4xl">
              יום הרווקים<span className="text-brand">.</span>
            </div>
            <div className="mt-1.5 text-sm font-semibold text-neutral-700 sm:text-base">
              לא צריך זוג בשביל לחסוך — 20 מוצרים, עד 20% הנחה.
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            <SinglesDayCountdown compact initialNow={initialNow} />
            <span className="bg-brand group-hover:bg-brand-hover inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl px-4 py-3 text-sm font-bold text-white transition">
              לכל המבצעים
              <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
            </span>
          </div>
        </div>
      </Link>
    </div>
  );
}
