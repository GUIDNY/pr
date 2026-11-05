"use client";

import { useEffect, useState } from "react";

/* Israel is on winter time (UTC+2) by 11 November, so the day runs
   00:00–24:00 at +02:00. Fixed instants rather than "midnight local", so a
   visitor abroad counts down to the same moment the shop does. */
const START = Date.parse("2026-11-11T00:00:00+02:00");
const END = Date.parse("2026-11-12T00:00:00+02:00");

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

const pad = (n: number) => String(n).padStart(2, "0");

export function SinglesDayCountdown({
  initialNow,
  compact = false,
  tone = "paper",
}: {
  initialNow?: number;
  compact?: boolean;
  /* paper: ink tiles on cream. red: on a red ground, gold digits on deep red. */
  tone?: "paper" | "red";
}) {
  // Starts from the server's clock when there is one, so the first paint
  // already has numbers in it, then takes over from the browser's.
  const [now, setNow] = useState(() => initialNow ?? Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

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
    [String(t.d), "ימים"],
    [pad(t.h), "שעות"],
    [pad(t.m), "דקות"],
    [pad(t.s), "שניות"],
  ];

  return (
    <div>
      <p className={`${compact ? "mb-1 text-xs" : "mb-2 text-sm"} font-semibold ${muted}`}>
        {live ? "המבצע נגמר בעוד" : "המבצע מתחיל בעוד"}
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
