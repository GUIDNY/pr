import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkInternalKey, unauthorized } from "@/lib/complaints/internal-key";
import { addDays, DAY_NAMES, israelToday, weekDates, weekStart } from "@/lib/shifts/week";
import { shiftsForWeek } from "@/lib/shifts/data";

/**
 * Next week's order shifts, read-only, for the n8n reminders. "Next week" is
 * Sunday to Saturday after today, Israel time. Same x-internal-key as the
 * complaints routes. `constraints` is reserved and empty until they exist.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!checkInternalKey(request)) return unauthorized();

  const start = weekStart(addDays(israelToday(), 1));
  const [shifts, settings] = await Promise.all([shiftsForWeek(start), db.shiftSetting.findMany({ where: { key: { in: ["phone_idan", "phone_asaf"] } } })]);
  const phone = (key: string) => settings.find((s) => s.key === key)?.value || null;

  const days = weekDates(start).map((date, i) => ({ date, weekday: DAY_NAMES[i], name: shifts[date] ?? null }));
  const missing = days.filter((d) => !d.name).map((d) => d.weekday);
  return NextResponse.json({
    weekStart: start,
    days,
    filled: missing.length === 0,
    missing,
    constraints: [],
    staff: [
      { name: "עידן", phone: phone("phone_idan") },
      { name: "אסף", phone: phone("phone_asaf") },
    ],
    adminUrl: `https://buytoday.co.il/admin/shifts?week=${start}`,
  });
}
