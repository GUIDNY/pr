// Guards the daily price-sheet mail without a database or a network.
// Run: npx tsx scripts/check-price-sheets-email.ts
import { jerusalemNow } from "../src/lib/instagram-plan";
import {
  DEFAULT_RECIPIENT, formatDateTime, formatSize, recipientFrom, renderPriceSheetsEmail,
  SEND_HOUR, sheetLines, subjectFor, type SheetFacts,
} from "../src/lib/price-sheets-email";

let failed = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) { console.log(`FAIL  ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); failed++; }
};
const ok = (name: string, cond: boolean) => eq(name, cond, true);

// The clock. vercel.json fires at 04:00 and 05:00 UTC; exactly one of them is
// 07:00 in Jerusalem, summer and winter.
const hourAt = (iso: string) => jerusalemNow(new Date(iso)).hour;
eq("summer 04:00Z is 07", hourAt("2026-07-15T04:00:00Z"), 7);
eq("summer 05:00Z is 08", hourAt("2026-07-15T05:00:00Z"), 8);
eq("winter 04:00Z is 06", hourAt("2026-11-23T04:00:00Z"), 6);
eq("winter 05:00Z is 07", hourAt("2026-11-23T05:00:00Z"), 7);
for (const day of ["2026-03-26", "2026-03-27", "2026-03-28", "2026-10-24", "2026-10-25", "2026-10-26"]) {
  const hits = [`${day}T04:00:00Z`, `${day}T05:00:00Z`].filter((t) => hourAt(t) === SEND_HOUR).length;
  eq(`exactly one firing is 07:00 on ${day}`, hits, 1);
}

// The subject uses Israel's calendar day, not UTC's.
eq("subject", subjectFor(new Date("2026-11-23T05:00:00Z")), "מחירונים – 23.11.2026");
eq("subject after local midnight", subjectFor(new Date("2026-11-22T22:30:00Z")), "מחירונים – 23.11.2026");
eq("test subject", subjectFor(new Date("2026-11-23T05:00:00Z"), true), "[בדיקה] מחירונים – 23.11.2026");
eq("datetime", formatDateTime(new Date("2026-11-23T05:30:00Z")), "23.11.2026 07:30");

eq("size KB", formatSize(612 * 1024), "612 KB");
eq("size MB", formatSize(Math.round(1.4 * 1024 * 1024)), "1.4 MB");
eq("size unknown", formatSize(null), "לא ידוע");

// Staleness: strictly more than 24 hours since the last upload.
const now = new Date("2026-11-23T05:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000);
const sheet = (over: Partial<SheetFacts>): SheetFacts => ({ label: "מחירון א", uploadedAt: hoursAgo(5), lastScannedAt: hoursAgo(1), sizeBytes: 500_000, attached: true, ...over });
eq("fresh is not stale", sheetLines(sheet({}), now).stale, false);
eq("exactly 24h is not stale", sheetLines(sheet({ uploadedAt: hoursAgo(24) }), now).stale, false);
eq("24h and a bit is stale", sheetLines(sheet({ uploadedAt: hoursAgo(24.1) }), now).stale, true);
ok("stale says so in words", sheetLines(sheet({ uploadedAt: hoursAgo(30) }), now).lines.some((l) => l.includes("לא התעדכן ביותר מ-24 שעות")));
ok("stale, agent fresh: file probably unchanged", sheetLines(sheet({ uploadedAt: hoursAgo(30) }), now).lines.some((l) => l.includes("כנראה לא השתנה")));
ok("stale, agent silent: check the office machine", sheetLines(sheet({ uploadedAt: hoursAgo(30), lastScannedAt: hoursAgo(30) }), now).lines.some((l) => l.includes("כדאי לבדוק את המחשב במשרד")));
eq("never uploaded is stale", sheetLines(sheet({ uploadedAt: null }), now).stale, true);
ok("missing attachment is said", sheetLines(sheet({ attached: false }), now).lines.some((l) => l.includes("לא צורף")));

// The whole mail.
const mail = renderPriceSheetsEmail([sheet({ label: "מחירון א" }), sheet({ label: "מחירון ב", uploadedAt: hoursAgo(40) }), sheet({ label: "מחירון ג" })], now);
eq("mail subject", mail.subject, "מחירונים – 23.11.2026");
ok("all three names in body", ["מחירון א", "מחירון ב", "מחירון ג"].every((n) => mail.body.includes(n)));
ok("stale warning at the top", mail.body.includes("יש מחירון שלא התעדכן"));
ok("html is rtl", (mail.html ?? "").includes('dir="rtl"'));
const clean = renderPriceSheetsEmail([sheet({}), sheet({}), sheet({})], now);
ok("no warning when all fresh", !clean.body.includes("יש מחירון שלא התעדכן"));
const escaped = renderPriceSheetsEmail([sheet({ label: "<b>x</b>" })], now);
ok("html escapes labels", !(escaped.html ?? "").includes("<b>x</b>"));

// Recipient: env, else the default; never a list.
eq("default recipient", recipientFrom(undefined), DEFAULT_RECIPIENT);
eq("blank recipient", recipientFrom("  "), DEFAULT_RECIPIENT);
eq("not an address", recipientFrom("hello"), DEFAULT_RECIPIENT);
eq("a list falls back", recipientFrom("a@b.co,c@d.co"), DEFAULT_RECIPIENT);
eq("env wins", recipientFrom(" owner@example.com "), "owner@example.com");

console.log(failed === 0 ? "ALL PASS" : `${failed} FAILED`);
process.exit(failed ? 1 : 0);
