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
 * How long a gap is allowed before somebody is told — counted in hours when
 * the agent could actually have reported, not hours on the clock.
 *
 * The agent runs twice a day and the widest healthy gap between runs is
 * sixteen hours, so eighteen leaves slack for a late one without letting a
 * whole cycle pass. That was right about weekdays and wrong about weekends.
 *
 * The file server the sheets live on is in the office, and the office shuts
 * it down from Friday afternoon until somebody opens on Sunday morning. The
 * agent keeps firing on schedule through all of it — Friday 15:30, Saturday
 * twice, Sunday 07:30 — finds no share, says so in its log and reports
 * nothing. That is the system behaving correctly, and on a wall clock it is
 * a 45-hour silence: two and a half times this threshold, every single week.
 *
 * An alert that fires every Saturday on a healthy shop is the failure this
 * watchdog exists to prevent. Its own comment says so: the back office
 * learns to scroll past it and takes the next real one with it. So the
 * weekend is not counted — the clock only runs while a report was possible.
 */
export const STALE_AFTER_OPEN_HOURS = 18;

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
 * Hour by hour rather than by arithmetic on day boundaries, because the
 * arithmetic is where the off-by-one lives and the loop is bounded: it stops
 * counting the moment it passes the threshold, so a server that has been
 * silent for a year costs the same as one silent for a day.
 */
export function openHoursBetween(from: Date, to: Date, capAt = STALE_AFTER_OPEN_HOURS * 4): number {
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
