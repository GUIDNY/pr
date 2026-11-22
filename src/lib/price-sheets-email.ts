/**
 * The daily price-sheet mail: what it says, with no database and no network.
 *
 * Pure on purpose, so scripts/check-price-sheets-email.ts can pin the parts
 * that are easy to get wrong without a deploy — the date in the subject
 * (Israel's calendar day, not UTC's), the "more than 24 hours" wording, and
 * the file sizes.
 *
 * The files themselves are the company's own price lists, which live in
 * private storage and ride along as attachments. Nothing in this file, and
 * nothing in the repository, holds a price or a copy of a sheet.
 */
import type { Message } from "@/lib/notify/types";

const TZ = "Asia/Jerusalem";
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export type SheetFacts = {
  /** The sheet's display name, e.g. "מחירון מלאי אלקטרוניקה". */
  label: string;
  /** When the office agent last uploaded a *changed* file. */
  uploadedAt: Date | null;
  /** When the agent last reported in, changed or not. */
  lastScannedAt: Date | null;
  sizeBytes: number | null;
  /** True when the workbook is attached to this mail. */
  attached: boolean;
};

function parts(date: Date) {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const g = (t: string) => f.find((p) => p.type === t)!.value;
  return { d: g("day"), m: g("month"), y: g("year"), h: g("hour"), min: g("minute") };
}

/** DD.MM.YYYY on Israel's calendar. */
export function formatDate(date: Date): string {
  const p = parts(date);
  return `${p.d}.${p.m}.${p.y}`;
}

/** DD.MM.YYYY HH:MM on Israel's clock. */
export function formatDateTime(date: Date): string {
  const p = parts(date);
  return `${p.d}.${p.m}.${p.y} ${p.h}:${p.min}`;
}

export function formatSize(bytes: number | null): string {
  if (bytes == null) return "לא ידוע";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function subjectFor(now: Date, test = false): string {
  return `${test ? "[בדיקה] " : ""}מחירונים – ${formatDate(now)}`;
}

/**
 * One sheet's lines. A sheet is stale when the last upload is more than 24
 * hours old — said plainly. The agent only uploads a file that changed, so a
 * stale upload can mean "the supplier changed nothing" or "the office machine
 * went quiet"; the second line tells the two apart, because the agent's last
 * check-in is fresh in the first case and old in the second.
 */
export function sheetLines(sheet: SheetFacts, now: Date): { lines: string[]; stale: boolean } {
  const lines: string[] = [];
  if (!sheet.attached) lines.push("הקובץ לא צורף: לא נמצא באחסון או שהקריאה ממנו נכשלה.");
  if (!sheet.uploadedAt) {
    lines.push("לא הועלה קובץ מעולם.");
    return { lines, stale: true };
  }
  lines.push(`העלאה אחרונה: ${formatDateTime(sheet.uploadedAt)}`);
  lines.push(`גודל: ${formatSize(sheet.sizeBytes)}`);
  const stale = now.getTime() - sheet.uploadedAt.getTime() > STALE_AFTER_MS;
  if (stale) {
    lines.push("שימו לב: המחירון לא התעדכן ביותר מ-24 שעות.");
    const scanFresh = sheet.lastScannedAt && now.getTime() - sheet.lastScannedAt.getTime() <= STALE_AFTER_MS;
    if (sheet.lastScannedAt) {
      lines.push(
        scanFresh
          ? `הסוכן במשרד דיווח לאחרונה ב-${formatDateTime(sheet.lastScannedAt)}, כלומר הקובץ כנראה לא השתנה.`
          : `גם הסוכן במשרד לא דיווח מעל 24 שעות (דיווח אחרון ${formatDateTime(sheet.lastScannedAt)}). כדאי לבדוק את המחשב במשרד.`,
      );
    }
  }
  return { lines, stale };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function renderPriceSheetsEmail(
  sheets: SheetFacts[],
  now: Date,
  opts: { test?: boolean } = {},
): Pick<Message, "subject" | "body" | "html"> {
  const subject = subjectFor(now, opts.test);
  const rendered = sheets.map((s) => ({ s, ...sheetLines(s, now) }));
  const anyStale = rendered.some((r) => r.stale);

  const intro = opts.test
    ? "זהו מייל בדיקה. המייל היומי נשלח כל בוקר ב-07:00 שעון ישראל."
    : `שלושת המחירונים העדכניים ל-${formatDate(now)}, כפי שהועלו מהמשרד.`;

  const text = [
    intro,
    ...(anyStale ? ["", "יש מחירון שלא התעדכן ביותר מ-24 שעות. הפרטים מתחת לכל קובץ."] : []),
    "",
    ...rendered.flatMap(({ s, lines }, i) => [`${i + 1}. ${s.label}`, ...lines.map((l) => `   ${l}`), ""]),
  ].join("\n").trimEnd();

  const html = `<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#111">
<p>${esc(intro)}</p>
${anyStale ? `<p style="background:#fff4e5;border:1px solid #f0b36b;padding:8px 12px;border-radius:6px"><strong>יש מחירון שלא התעדכן ביותר מ-24 שעות.</strong> הפרטים מתחת לכל קובץ.</p>` : ""}
${rendered
  .map(
    ({ s, lines, stale }) => `<div style="margin:12px 0;padding:10px 12px;border:1px solid ${stale ? "#f0b36b" : "#ddd"};border-radius:6px">
<strong>${esc(s.label)}</strong><br>${lines.map(esc).join("<br>")}</div>`,
  )
  .join("\n")}
</div>`;

  return { subject, body: text, html };
}

/** Is it 07:00 in Israel? Same trick as the Instagram cron: vercel.json fires
    at 04:00 and 05:00 UTC, and exactly one of them is 07:00 in Jerusalem in
    both summer and winter time. */
export const SEND_HOUR = 7;

/** Fallback when PRICE_SHEETS_EMAIL_TO is unset or not an address. */
export const DEFAULT_RECIPIENT = "info@buytoday.co.il";

export function recipientFrom(value: string | undefined | null): string {
  const v = (value ?? "").trim();
  return /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(v) ? v : DEFAULT_RECIPIENT;
}
