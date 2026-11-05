/**
 * When Singles' Day 2026 is on — one fact, shared by the page, the homepage
 * banner and the countdown, so they cannot disagree about the minute.
 *
 * Kept apart from singles-day-2026.ts on purpose: that file carries cost and
 * margin, and the countdown is a client component, so anything it imports
 * ships to every browser.
 *
 * Israel is on winter time (UTC+2) by 11 November. The prices themselves are
 * switched in the database at the same instants, by two pg_cron jobs
 * (campaign.singles_day_2026_start / _end, scheduled 22:00 UTC on the 10th
 * and the 11th) — the page only decides what to show; it never sets a price.
 */
export const SINGLES_DAY_START_MS = Date.parse("2026-11-11T00:00:00+02:00");
export const SINGLES_DAY_END_MS = Date.parse("2026-11-12T00:00:00+02:00");

export type SinglesDayPhase = "before" | "live" | "over";

export function singlesDayPhase(nowMs: number): SinglesDayPhase {
  if (nowMs < SINGLES_DAY_START_MS) return "before";
  if (nowMs < SINGLES_DAY_END_MS) return "live";
  return "over";
}
