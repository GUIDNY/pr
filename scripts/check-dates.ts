/**
 * Every date this product prints is Israel's.
 *
 * The runtime is UTC. Vercel's functions run in UTC, and an
 * `Intl.DateTimeFormat` with no `timeZone` formats in the runtime's zone,
 * not the reader's — so for a weekend the inventory screen told the owner
 * his last sync was "15 באוק׳ 21:32" when it had finished at 00:32 on the
 * 16th. Wrong hour, wrong day, and convincing enough that he reasonably
 * concluded the sync had not run.
 *
 * Nothing about that is visible in a type or in a local `npm run dev`,
 * because a developer machine set to Israel renders it correctly. The only
 * way to see it is to format under UTC, which is what this does —
 * `check:dates` sets TZ=UTC, exactly the condition in production.
 *
 *   npm run check:dates
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { formatDate, formatDateTime } from "../src/lib/format";

let failures = 0;

function is(name: string, got: unknown, want: unknown) {
  const ok = got === want;
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name} → ${got}${ok ? "" : `  (expected ${want})`}`);
}

console.log(`Formatting under TZ=${process.env.TZ ?? "(unset)"}`);

/* The real one. The sync finished at 21:32:51 UTC on 15 October, which is
   00:32 on the 16th in Israel, and the screen said the 15th. */
const theSync = new Date("2026-10-15T21:32:51Z");
is("the sync that read as the day before", formatDateTime(theSync), "16 באוק׳ 2026, 00:32");
is("and its date alone", formatDate(theSync), "16 באוקטובר 2026");

/* Both sides of the clock change, because an offset would pass one and
   fail the other. Israel is UTC+3 in October and UTC+2 in December. */
is("October, UTC+3", formatDateTime(new Date("2026-10-20T10:00:00Z")), "20 באוק׳ 2026, 13:00");
is("December, UTC+2", formatDateTime(new Date("2026-12-20T10:00:00Z")), "20 בדצמ׳ 2026, 12:00");

/* Midnight is where an hour of drift becomes a day of drift, which is the
   whole reason this was worth a check rather than a one-line fix. */
is("22:30 UTC is already tomorrow here", formatDate(new Date("2026-06-30T22:30:00Z")), "1 ביולי 2026");

console.log("\nNo formatter left reading the server's clock");
/* The fix above is worthless if the next one is written without it, and
   "add timeZone" is exactly the line a reviewer's eye slides over. */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "generated" || entry === "node_modules") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const unpinned: string[] = [];
for (const file of walk("src")) {
  const text = readFileSync(file, "utf8");
  /* The call and its options object, which is always a literal here. */
  for (const m of text.matchAll(/(?:new Intl\.DateTimeFormat|toLocaleDateString|toLocaleTimeString)\s*\([^)]*\)/g)) {
    if (!m[0].includes("timeZone")) {
      unpinned.push(`${file}: ${m[0].replace(/\s+/g, " ").slice(0, 90)}`);
    }
  }
}
is("every date formatter names its time zone", unpinned.length, 0);
for (const u of unpinned) console.log(`        ${u}`);

console.log(
  failures === 0
    ? "\nThe shop has one clock, and it is Israel's.\n"
    : `\n${failures} date rule(s) BROKEN.\n`,
);
process.exit(failures === 0 ? 0 : 1);
