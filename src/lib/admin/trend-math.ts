/** Percentage change of `cur` against `prev`; null when there is no base to
    compare with (a previous period of zero says nothing about a rate). */
export function pctChange(cur: number, prev: number): number | null {
  if (!Number.isFinite(cur) || !Number.isFinite(prev) || prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

export function cumulative(values: number[]): number[] {
  let sum = 0;
  return values.map((v) => (sum += v));
}

/** YYYY-MM-DD keys for `days` consecutive days ending at `endKey`. Pure
    calendar arithmetic on UTC, so no daylight-saving day is ever 23 hours. */
export function dayKeys(endKey: string, days: number): string[] {
  const end = Date.UTC(+endKey.slice(0, 4), +endKey.slice(5, 7) - 1, +endKey.slice(8, 10));
  return Array.from({ length: days }, (_, i) => new Date(end - (days - 1 - i) * 86400000).toISOString().slice(0, 10));
}

export function shiftKey(key: string, days: number): string {
  return new Date(Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10)) + days * 86400000)
    .toISOString()
    .slice(0, 10);
}
