/** Weeks run Sunday to Saturday, in Israel time. Dates are YYYY-MM-DD strings. */
export const SHIFT_PEOPLE = ["עידן", "אסף"] as const;
export type ShiftPerson = (typeof SHIFT_PEOPLE)[number];
export const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

export function israelToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(now);
}
export function israelHour(now = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", hourCycle: "h23" }).format(now));
}
function toUtc(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}
export function addDays(date: string, n: number): string {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** The Sunday on or before `date`. */
export function weekStart(date: string): string {
  return addDays(date, -toUtc(date).getUTCDay());
}
export function weekDates(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}
export function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(toUtc(s).getTime());
}
export function shortDate(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(d)}.${Number(m)}`;
}
export function weekText(start: string, shifts: Record<string, string>): string {
  const lines = weekDates(start).map((d, i) => `${DAY_NAMES[i]} ${shortDate(d)}: ${shifts[d] ?? "—"}`);
  return `משמרות הזמנות Buy Today · ${shortDate(start)}–${shortDate(addDays(start, 6))}\n${lines.join("\n")}`;
}
