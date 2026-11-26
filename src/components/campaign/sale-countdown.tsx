"use client";

import Link from "next/link";
import { useSinglesDayClock } from "@/components/campaign/countdown";

/**
 * Per-product sale clocks. Fixed list on purpose: only products with a real,
 * stated end date get a clock; a compareAtPrice alone never does.
 * sku -> end instant (Asia/Jerusalem, +02:00 in winter).
 */
export const SALE_COUNTDOWNS: Record<string, string> = {
  "1312": "2026-11-30T23:59:00+02:00",
};

const pad = (n: number) => String(n).padStart(2, "0");

export function SaleCountdown({ sku }: { sku: string }) {
  const endIso = SALE_COUNTDOWNS[sku];
  const now = useSinglesDayClock();
  if (!endIso) return null;
  const end = Date.parse(endIso);
  const s = now === null ? 0 : Math.floor((end - now) / 1000);
  if (now !== null && !(s > 0)) return null;
  const note = (
    <p className="mt-2 text-sm leading-snug font-semibold text-neutral-800">
      עד 30.11 · עד גמר המלאי ו
      <Link href="/black-november/takanon" className="text-brand underline underline-offset-2">
        בכפוף לתקנון המבצע
      </Link>
    </p>
  );
  if (now === null) return <div>{note}</div>;
  const cells: [string, string][] = [
    [String(Math.floor(s / 86400)), "ימים"],
    [pad(Math.floor((s % 86400) / 3600)), "שעות"],
    [pad(Math.floor((s % 3600) / 60)), "דקות"],
    [pad(s % 60), "שניות"],
  ];
  return (
    <div>
      <p className="mb-1 text-sm font-semibold text-neutral-600">המבצע מסתיים בעוד</p>
      <div dir="ltr" className="flex items-start justify-end gap-1.5" role="timer" aria-live="off">
        {cells.map(([v, label], i) => (
          <div key={label} className="flex items-start gap-1.5">
            <div className="text-center">
              <div className="bg-brand min-w-11 rounded-md px-1.5 py-1 text-2xl font-black text-white tabular-nums">{v}</div>
              <div className="mt-0.5 text-[10px] font-medium text-neutral-500">{label}</div>
            </div>
            {i < cells.length - 1 && <span className="pt-0.5 text-lg font-black text-neutral-300">:</span>}
          </div>
        ))}
      </div>
      {note}
    </div>
  );
}
