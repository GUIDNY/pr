import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManageCatalog } from "@/lib/permissions";
import { db } from "@/lib/db";
import { SITE_URL } from "@/lib/site-url";
import { emailChannel } from "@/lib/notify/channels";
import { ownerAlertRecipients } from "@/lib/notify/owner-alert";
import { addDays, israelHour, israelToday, weekDates, weekStart } from "@/lib/shifts/week";
import { shiftsForWeek } from "@/lib/shifts/data";

/**
 * Saturday 10:00 (Israel): remind to sign up for next week. Saturday 20:00:
 * again, only if next week is still not full. Vercel crons run in UTC and
 * Israel moves between +2 and +3, so the cron fires at both candidate UTC
 * hours and the Israel hour decides; a marker row makes each reminder once.
 *
 * Sent by email to the owner addresses: the SMS provider is not wired and
 * WhatsApp needs a Meta-approved template. Ends with a link to the page.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!(secret && auth === `Bearer ${secret}`)) {
    const session = await getSession();
    if (!session || !canManageCatalog(session.role)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const today = israelToday();
  const hour = israelHour();
  const isSaturday = new Date(`${today}T00:00:00Z`).getUTCDay() === 6;
  const which = hour === 10 ? "morning" : hour === 20 ? "evening" : null;
  if (!(isSaturday && which)) return NextResponse.json({ ok: true, skipped: "not a reminder hour" });

  const next = weekStart(addDays(today, 1));
  const shifts = await shiftsForWeek(next);
  const full = weekDates(next).every((d) => shifts[d]);
  if (which === "evening" && full) return NextResponse.json({ ok: true, skipped: "week full" });

  const key = `reminded_${which}_${next}`;
  if (await db.shiftSetting.findUnique({ where: { key } })) return NextResponse.json({ ok: true, skipped: "already sent" });
  await db.shiftSetting.create({ data: { key, value: new Date().toISOString() } });

  const link = `${SITE_URL}/admin/shifts?week=${next}`;
  const body =
    which === "morning"
      ? `תזכורת: להשתבץ למשמרות ההזמנות של השבוע הבא.\n${link}`
      : `עדיין לא נרשמתם במלואו למשמרות ההזמנות של השבוע הבא.\n${link}`;
  const results = await Promise.all(
    ownerAlertRecipients().map((to) =>
      emailChannel.send(to, { subject: "תזכורת משמרות הזמנות", body }).catch((e) => ({ ok: false, error: String(e) })),
    ),
  );
  return NextResponse.json({ ok: true, kind: which, week: next, results });
}
