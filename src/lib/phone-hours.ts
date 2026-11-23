import { BUSINESS } from "@/lib/business";

/**
 * Is the shop's telephone line staffed at this moment, on Israel's clock?
 *
 * BUSINESS.phoneHours is the one statement of when a person picks up, and the
 * failure page uses this to decide whether it may say "a representative will
 * call you within minutes" (inside the hours) or only "we will call when the
 * line opens" (nights, Fridays after 13:00, Saturday). Opening is inclusive and
 * closing is exclusive: at 18:00 on a Thursday nobody is promised a call.
 *
 * Israel's time zone, not the server's: Vercel runs in UTC, and the offset
 * changes twice a year, which is why this goes through Intl and not a
 * hard-coded hour.
 */
const TZ = "Asia/Jerusalem";

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function isPhoneOpen(now: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const day = get("weekday");
  const minutes = Number(get("hour")) * 60 + Number(get("minute"));
  return BUSINESS.phoneHours.some(
    (slot) => (slot.days as readonly string[]).includes(day) && minutes >= toMinutes(slot.opens) && minutes < toMinutes(slot.closes),
  );
}
