/**
 * The date Google Customer Reviews is told an order arrives by.
 *   npm run check:delivery-eta
 */
import { addBusinessDaysIL, estimatedDeliveryDate, promisedBusinessDays } from "../src/lib/delivery-eta";

let failed = 0;
function eq(label: string, got: unknown, want: unknown) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${String(got)}${ok ? "" : ` (want ${String(want)})`}`);
}

// 17 Nov 2026 is a Tuesday.
eq("Tue + 7 business days → next Thu", addBusinessDaysIL(new Date("2026-11-17T09:00:00+02:00"), 7), "2026-11-26");
eq("Thu + 1 → Sun", addBusinessDaysIL(new Date("2026-11-19T09:00:00+02:00"), 1), "2026-11-22");
eq("Fri counts from Sun, + 0 → Sun", addBusinessDaysIL(new Date("2026-11-20T09:00:00+02:00"), 0), "2026-11-22");
eq("Sat + 7 → Tue week after", addBusinessDaysIL(new Date("2026-11-21T12:00:00+02:00"), 7), "2026-12-01");
// 23:30 Israel on Thursday is still Thursday, though UTC says 21:30 — and 00:30 Friday Israel is Thursday in UTC.
eq("Fri 00:30 Israel is Friday", addBusinessDaysIL(new Date("2026-11-19T22:30:00Z"), 1), "2026-11-23");

eq("PICKUP = handling max", promisedBusinessDays("PICKUP", [{ deliveryDays: 7 }]), 1);
eq("DELIVERY unset = national max", promisedBusinessDays("DELIVERY", [{ deliveryDays: 7 }]), 7);
eq("PICKUP_POINT unset = national max", promisedBusinessDays("PICKUP_POINT", [{ deliveryDays: 7 }]), 7);
eq("own figure wins, longest item", promisedBusinessDays("DELIVERY", [{ deliveryDays: 2 }, { deliveryDays: 4 }]), 4);
eq("no items = national max", promisedBusinessDays("DELIVERY", []), 7);
eq("end to end", estimatedDeliveryDate(new Date("2026-11-17T09:00:00+02:00"), "DELIVERY", [{ deliveryDays: 7 }]), "2026-11-26");

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log("all passed");
