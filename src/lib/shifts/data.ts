import "server-only";
import { db } from "@/lib/db";
import { weekDates } from "./week";

export async function shiftsForWeek(start: string): Promise<Record<string, string>> {
  const rows = await db.orderShift.findMany({ where: { date: { in: weekDates(start) } } });
  return Object.fromEntries(rows.map((r) => [r.date, r.person]));
}
export async function getSettings(): Promise<Record<string, string>> {
  const rows = await db.shiftSetting.findMany();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
