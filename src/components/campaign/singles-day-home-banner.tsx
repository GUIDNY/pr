"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SinglesDayCountdown, useSinglesDayClock } from "@/components/campaign/countdown";
import { singlesDayPhase } from "@/lib/campaigns/singles-day-window";
import { cn } from "@/lib/utils";

/**
 * The homepage's way in to /singles-day, for every visitor.
 *
 * Until 00:00 on 11.11 it counts down to the opening and the page behind it
 * shows only the same clock; on the day it counts down to the end and the
 * page shows the deals; after 24:00 it is gone. All three are decided in the
 * browser from the clock, because the homepage is cached at the edge for
 * minutes at a time and a server-rendered phase could be stale by the time it
 * arrives.
 */
export function PublicSinglesDayBanner({ inset = false, className }: { inset?: boolean; className?: string }) {
  const now = useSinglesDayClock();
  if (now !== null && singlesDayPhase(now) === "over") return null;
  return <SinglesDayHomeBanner inset={inset} className={className} />;
}

/* The colours are the festival's, not a retailer's: the red and gold of a
   hongbao, the red envelope money is given in, with its gold edge. Tmall's
   own red-black-yellow system and its marks are a registered identity and
   stay out. 光棍节 — "bare-branch festival" — is the day's own name in
   Chinese, older than any shop's campaign for it. */
export function SinglesDayHomeBanner({
  initialNow,
  inset = false,
  className,
}: {
  initialNow?: number;
  /* true inside a container that already pads (the phone hero band). */
  inset?: boolean;
  className?: string;
}) {
  const now = useSinglesDayClock(initialNow);
  const live = now !== null && singlesDayPhase(now) === "live";
  return (
    <div className={cn(inset ? "" : "mx-auto max-w-7xl px-4 pt-4", className)}>
      <Link
        href="/singles-day"
        className="group relative block overflow-hidden rounded-2xl bg-[radial-gradient(120%_140%_at_85%_0%,#ff2a3d_0%,#e3001b_45%,#a8000f_100%)] text-white shadow-[0_10px_30px_-12px_rgb(168_0_15/0.6)] transition hover:shadow-[0_16px_40px_-12px_rgb(168_0_15/0.7)]"
      >
        {/* the envelope's gold edge */}
        <span aria-hidden className="pointer-events-none absolute inset-1.5 rounded-[0.8rem] border border-[#ffd25a]/45" />
        {/* the four ones, in gold line */}
        <span
          aria-hidden
          dir="ltr"
          className="pointer-events-none absolute -bottom-6 left-0 select-none text-[9rem] font-black leading-none tracking-[-0.05em] text-transparent [-webkit-text-stroke:1.5px_rgb(255_210_90/0.28)] sm:-bottom-10 sm:text-[13rem]"
        >
          11.11
        </span>

        <div className="relative flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-8 sm:p-6">
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-white/85">
              <span className="rounded-sm bg-[#ffd25a] px-1.5 py-0.5 font-mono tracking-[0.15em] text-[#7d000c]">11.11</span>
              <span lang="zh" className="text-[#ffd25a]">光棍节</span>
              <span>{live ? "· עכשיו! · עד גמר המלאי" : "· יום אחד · עד גמר המלאי"}</span>
            </div>
            <div className="text-[1.75rem] font-black leading-none tracking-tight sm:text-4xl">
              יום הרווקים <span className="text-[#ffd25a]">הסיני</span>
            </div>
            <div className="mt-1.5 text-sm font-semibold text-white/90 sm:text-base">
              לא צריך זוג בשביל לחסוך — עד 20% הנחה, יום אחד בלבד.
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            <SinglesDayCountdown compact tone="red" initialNow={initialNow} />
            <span className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#ffd25a] px-4 py-3 text-sm font-black text-[#7d000c] shadow-[inset_0_-2px_0_rgb(0_0_0/0.12)] transition group-hover:bg-[#ffdf80]">
              {live ? "לכל המבצעים" : "לדף המבצע"}
              <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
            </span>
          </div>
        </div>
      </Link>
    </div>
  );
}
