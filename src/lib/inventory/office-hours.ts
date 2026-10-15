/**
 * When the agent could have reported, and how long it has not.
 *
 * In a file with no server imports and no database, so the watchdog that
 * raises the alert and the check that proves the rule can both read the
 * same one — the same reason lib/delivery.ts sits where it does. The rule
 * is pure arithmetic over a clock; the only thing that made it untestable
 * was living next to a Prisma client.
 */

/**
 * How many reports may be missed before somebody is told.
 *
 * Counted in the agent's own scheduled runs, not in hours, and the history
 * of this number is the argument for that unit.
 *
 * It started as 18 hours on the clock: the agent runs twice a day, the
 * widest healthy gap between runs is sixteen hours, so eighteen left slack
 * for a late one without letting a whole cycle pass. Right about weekdays
 * and wrong about weekends — the file server is in the office and the
 * office shuts it down from Friday afternoon until somebody opens on
 * Sunday morning, which is a 45-hour silence on a healthy shop, every
 * single week. So the hours were changed to count only when the server was
 * on, which removed the false alarm and quietly destroyed the threshold:
 * the widest healthy gap is about four *open* hours, so eighteen of them
 * stopped meaning "one missed cycle plus slack" and started meaning four
 * missed cycles.
 *
 * Which is not a hypothetical. The agent last reported on Wednesday
 * 14 October at 15:30 and then stopped. Thursday's 07:30 run did not
 * happen, Thursday's 15:30 run did not happen, the shop sold all day
 * against Wednesday's stock, and this watchdog would not have said a word
 * until Friday at 10:30 — 43 hours and four missed runs later. The owner
 * noticed first, which is the one outcome the whole file exists to prevent.
 *
 * Missed scheduled runs is the unit that cannot drift like that. It says
 * what the alert means in the words the threshold is written in, and it is
 * weekend-proof by construction rather than by arithmetic: a run that falls
 * when the server is off was never an opportunity to report, so it is not a
 * missed one.
 *
 * Two, not one. A single missed run is worth seeing and is not worth waking
 * anybody — a Mac that woke late pushes its 07:30 run to 08:40 and reports
 * normally. So one missed run is a WARNING and two is the CRITICAL, which
 * on weekdays lands the same day rather than the day after tomorrow.
 */
export const STALE_AFTER_MISSED_REPORTS = 2;

/**
 * When the agent is scheduled to report, in Israel's local time.
 *
 * Must stay in step with `StartCalendarInterval` in
 * scripts/agent/com.buytoday.pricesheets.plist, which is the only thing
 * that actually fires it — launchd on a Mac inside the company network,
 * because the site cannot reach the file server and never will. There is no
 * cron on the server for this and there cannot be one.
 */
export const AGENT_RUN_HOURS = [7, 15] as const;
export const AGENT_RUN_MINUTE = 30;

/**
 * When the file server is on, in Israel time.
 *
 * Deliberately not BUSINESS.phoneHours, though the temptation is obvious.
 * That is when a person answers the telephone, 10:30 to 18:00; this is when
 * a machine in the same building is powered, and the agent's 07:30 run has
 * been succeeding on weekdays for weeks — hours before anybody picks up a
 * phone. Tying the two together would start reporting a healthy 07:30 run
 * as impossible.
 *
 * Erring narrow on purpose. A window smaller than the truth only delays a
 * real alert; one larger than the truth brings back the false alarm this is
 * removing, and that costs more.
 */
const SERVER_WINDOW: Record<number, { from: number; to: number } | null> = {
  0: { from: 7, to: 18 }, // Sunday
  1: { from: 7, to: 18 },
  2: { from: 7, to: 18 },
  3: { from: 7, to: 18 },
  4: { from: 7, to: 18 }, // Thursday
  5: { from: 7, to: 14 }, // Friday — the shop closes at 13:00 and the server goes with it
  6: null, // Saturday
};

/**
 * Israel's weekday and hour for an instant, whatever the server thinks it
 * is. Vercel runs in UTC and Israel moves twice a year; reading the parts
 * out of a formatter rather than adding an offset is what keeps this
 * correct across the October and March changes without anybody remembering.
 */
function israelParts(at: Date): { day: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(at);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
  return { day: day < 0 ? 0 : day, hour };
}

/**
 * Hours between two instants during which the agent could have reported.
 *
 * No longer what raises the alert — see STALE_AFTER_MISSED_REPORTS — but
 * still the honest measure of how long a silence has lasted in hours the
 * office was open, and that is worth printing next to the wall clock on the
 * screen a person reads.
 *
 * Hour by hour rather than by arithmetic on day boundaries, because the
 * arithmetic is where the off-by-one lives and the loop is bounded: it stops
 * counting the moment it passes the threshold, so a server that has been
 * silent for a year costs the same as one silent for a day.
 */
export function openHoursBetween(from: Date, to: Date, capAt = 72): number {
  let open = 0;
  const cursor = new Date(from.getTime());
  cursor.setUTCMinutes(0, 0, 0);
  while (cursor < to && open < capAt) {
    const { day, hour } = israelParts(cursor);
    const window = SERVER_WINDOW[day];
    if (window && hour >= window.from && hour < window.to) open++;
    cursor.setUTCHours(cursor.getUTCHours() + 1);
  }
  return open;
}

/**
 * Scheduled reports the agent could have made in a window, and did not.
 *
 * "Could have" is the whole point. launchd fires at 07:30 and 15:30 every
 * day including Friday afternoon and Saturday, but the share it reads is
 * powered off, so those firings were never chances to report and a system
 * that misses them is working exactly as designed. Only a run that lands
 * while the server is on is counted, which is what makes this immune to the
 * weekend without a single special case about weekends.
 *
 * Walked hour by hour over Israel's own clock rather than computed from day
 * boundaries, for the reason openHoursBetween is: the arithmetic is where
 * the off-by-one and the DST mistake live. Israel changes its clock at
 * 02:00, so 07 and 15 are never the skipped or the repeated hour and a run
 * is never counted twice or dropped.
 *
 * Bounded by `capAt`, so a machine that has been off for a year is as cheap
 * to ask about as one that missed breakfast.
 */
export function missedReportsBetween(
  from: Date,
  to: Date,
  capAt = STALE_AFTER_MISSED_REPORTS * 4,
): number {
  let missed = 0;
  const cursor = new Date(from.getTime());
  cursor.setUTCMinutes(0, 0, 0);
  while (cursor < to && missed < capAt) {
    const { day, hour } = israelParts(cursor);
    if ((AGENT_RUN_HOURS as readonly number[]).includes(hour)) {
      const window = SERVER_WINDOW[day];
      /* The run fires at :30 past the hour the cursor is sitting on. It
         counts as missed only if it fell strictly after the last contact
         and has already passed — a run due in ten minutes is not late. */
      const dueAt = new Date(cursor.getTime() + AGENT_RUN_MINUTE * 60_000);
      const serverOn = window !== null && hour >= window.from && hour < window.to;
      if (serverOn && dueAt > from && dueAt <= to) missed++;
    }
    cursor.setUTCHours(cursor.getUTCHours() + 1);
  }
  return missed;
}
