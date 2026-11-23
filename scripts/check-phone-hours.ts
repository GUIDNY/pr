// Run: npx tsx scripts/check-phone-hours.ts
import { isPhoneOpen } from "../src/lib/phone-hours";
let failed = 0;
const eq = (name: string, got: boolean, want: boolean) => { if (got !== want) { console.log(`FAIL  ${name}: got ${got}, want ${want}`); failed++; } };
const at = (iso: string) => isPhoneOpen(new Date(iso));
// Winter (UTC+2): Sunday 22 Nov 2026.
eq("Sun 10:29 closed", at("2026-11-22T08:29:00Z"), false);
eq("Sun 10:30 open", at("2026-11-22T08:30:00Z"), true);
eq("Sun 17:59 open", at("2026-11-22T15:59:00Z"), true);
eq("Sun 18:00 closed", at("2026-11-22T16:00:00Z"), false);
eq("Sun 02:00 night closed", at("2026-11-22T00:00:00Z"), false);
// Summer (UTC+3): Sunday 12 Jul 2026.
eq("summer Sun 10:29 closed", at("2026-07-12T07:29:00Z"), false);
eq("summer Sun 10:30 open", at("2026-07-12T07:30:00Z"), true);
eq("summer Sun 18:00 closed", at("2026-07-12T15:00:00Z"), false);
// Friday: 10:30–13:00. 2026-11-27.
eq("Fri 12:59 open", at("2026-11-27T10:59:00Z"), true);
eq("Fri 13:00 closed", at("2026-11-27T11:00:00Z"), false);
eq("Fri 15:00 closed", at("2026-11-27T13:00:00Z"), false);
// Saturday: closed all day. 2026-11-28.
eq("Sat 12:00 closed", at("2026-11-28T10:00:00Z"), false);
// Local-date boundary: Saturday 23:30 UTC (Sat 01:30 Israel on Sunday? no: Sat 21:30Z = Sun 23:30 IL) is closed.
eq("Sun 23:30 closed", at("2026-11-22T21:30:00Z"), false);
// Thursday 17:30 open, 2026-11-26.
eq("Thu 17:30 open", at("2026-11-26T15:30:00Z"), true);
console.log(failed === 0 ? "ALL PASS" : `${failed} FAILED`);
process.exit(failed ? 1 : 0);
