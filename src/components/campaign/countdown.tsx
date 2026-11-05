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

export function SinglesDayCountdown({ initialNow }: { initialNow: number }) {
  // Starts from the server's clock so the first paint already has numbers in
  // it, then takes over from the browser's.
  const [now, setNow] = useState(initialNow);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const live = now >= START && now < END;
  const over = now >= END;
  const t = parts((live ? END : START) - now);

  if (over) {
    return <p className="text-lg font-bold">המבצע הסתיים. תודה לכל מי שהגיע.</p>;
  }

  const cells: [string, string][] = [
    [String(t.d), "ימים"],
    [pad(t.h), "שעות"],
    [pad(t.m), "דקות"],
    [pad(t.s), "שניות"],
  ];

  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-neutral-500">
        {live ? "המבצע נגמר בעוד" : "המבצע מתחיל בעוד"}
      </p>
      {/* dir=ltr: a clock reads days→seconds left to right in Hebrew too */}
      <div dir="ltr" className="flex items-start justify-end gap-1.5 sm:gap-2" role="timer" aria-live="off">
        {cells.map(([v, label], i) => (
          <div key={label} className="flex items-start gap-1.5 sm:gap-2">
            <div className="text-center">
              <div
                className={`${live ? "bg-brand" : "bg-neutral-950"} min-w-[3.25rem] rounded-lg px-2 py-2 text-3xl font-black tabular-nums text-white shadow-[inset_0_-2px_0_rgb(255_255_255/0.08)] sm:min-w-16 sm:text-4xl`}
              >
                {v}
              </div>
              <div className="mt-1 text-[11px] font-medium text-neutral-500">{label}</div>
            </div>
            {i < cells.length - 1 && <span className="pt-2 text-2xl font-black text-neutral-300 sm:text-3xl">:</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
