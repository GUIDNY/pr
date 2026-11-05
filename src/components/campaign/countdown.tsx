"use client";

import { useEffect, useState } from "react";
import { SINGLES_DAY_END_MS as END, SINGLES_DAY_START_MS as START } from "@/lib/campaigns/singles-day-window";

/**
 * The browser's clock, ticking once a second. Null until mounted when the
 * server gave no time of its own — the homepage is cached for minutes at a
 * time, so a number rendered there would be stale on arrival and would not
 * match what the browser computes on hydration.
 */
export function useSinglesDayClock(initialNow?: number): number | null {
  const [now, setNow] = useState<number | null>(initialNow ?? null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  return now;
}

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

const pad = (n: number) => String(n).padStart(2, "0");

export function SinglesDayCountdown({
  initialNow,
  compact = false,
  tone = "paper",
  reloadOnChange = false,
}: {
  initialNow?: number;
  compact?: boolean;
  /* paper: ink tiles on cream. red: on a red ground, gold digits on deep red. */
  tone?: "paper" | "red";
  /* Reload the page when the clock crosses 00:00 or 24:00, so a visitor
     waiting on the countdown sees the deals open without pressing anything. */
  reloadOnChange?: boolean;
}) {
  const clock = useSinglesDayClock(initialNow);
  const phaseNow = clock === null ? null : clock < START ? 0 : clock < END ? 1 : 2;
  const [phaseAtLoad] = useState(phaseNow);
  useEffect(() => {
    if (!reloadOnChange || phaseNow === null || phaseAtLoad === null || phaseNow === phaseAtLoad) return;
    // a few seconds' grace, so the database's own switch at the same minute has run
    const id = setTimeout(() => window.location.reload(), 4000);
    return () => clearTimeout(id);
  }, [reloadOnChange, phaseNow, phaseAtLoad]);

  const now = clock ?? START;
  const pending = clock === null;
  const live = now >= START && now < END;
  const over = now >= END;
  const t = parts((live ? END : START) - now);
  const onRed = tone === "red";
  const muted = onRed ? "text-white/75" : "text-neutral-500";
  const tile = onRed ? "bg-[#7d000c] text-[#ffd25a]" : live ? "bg-brand text-white" : "bg-neutral-950 text-white";

  if (over) {
    return <p className={`${compact ? "text-sm" : "text-lg"} font-bold`}>המבצע הסתיים. תודה לכל מי שהגיע.</p>;
  }

  const cells: [string, string][] = [
    [pending ? "–" : String(t.d), "ימים"],
    [pending ? "––" : pad(t.h), "שעות"],
    [pending ? "––" : pad(t.m), "דקות"],
    [pending ? "––" : pad(t.s), "שניות"],
  ];

  return (
    <div>
      <p className={`${compact ? "mb-1 text-xs" : "mb-2 text-sm"} font-semibold ${muted}`}>
        {live ? "המבצע נגמר בעוד" : "המבצע נפתח בעוד"}
      </p>
      {/* dir=ltr: a clock reads days→seconds left to right in Hebrew too */}
      <div dir="ltr" className="flex items-start justify-end gap-1.5 sm:gap-2" role="timer" aria-live="off">
        {cells.map(([v, label], i) => (
          <div key={label} className="flex items-start gap-1.5 sm:gap-2">
            <div className="text-center">
              <div
                className={`${tile} ${compact ? "min-w-10 rounded-md px-1.5 py-1 text-xl sm:min-w-11 sm:text-2xl" : "min-w-[3.25rem] rounded-lg px-2 py-2 text-3xl sm:min-w-16 sm:text-4xl"} font-black tabular-nums shadow-[inset_0_-2px_0_rgb(255_255_255/0.08)]`}
              >
                {v}
              </div>
              <div className={`${compact ? "mt-0.5 text-[10px]" : "mt-1 text-[11px]"} font-medium ${muted}`}>{label}</div>
            </div>
            {i < cells.length - 1 && <span className={`${compact ? "pt-0.5 text-lg" : "pt-2 text-2xl sm:text-3xl"} font-black ${onRed ? "text-[#ffd25a]/60" : "text-neutral-300"}`}>:</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
