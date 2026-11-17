/**
 * The open card form leaves for the confirmation when the server already says
 * the order is paid — the 17 November double payment (7,700 ₪ twice, the frame
 * never came back after a 000). Mocked fetch and a fake clock: no order, no
 * payment form, no network.
 *
 *   npm run check:paid-poll
 */
import { startPaidStatusPoll, paidConfirmationPath, STATUS_POLL_EVERY_MS } from "../src/lib/checkout/paid-status-poll";

let failed = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${JSON.stringify(got)}${ok ? "" : ` (want ${JSON.stringify(want)})`}`);
};

/** Runs a poll against a scripted list of statuses with a fake clock. */
async function run(statuses: (string | null | Error)[], { stopAfter }: { stopAfter?: number } = {}) {
  let clock = 0;
  const queue: (() => void)[] = [];
  const asked: number[] = [];
  const paid: string[] = [];
  let i = 0;
  const stop = startPaidStatusPoll("PR-913025", {
    now: () => clock,
    setTimer: (fn) => {
      queue.push(fn);
      return queue.length;
    },
    clearTimer: () => {
      queue.length = 0;
    },
    fetchStatus: async () => {
      asked.push(clock);
      const s = statuses[Math.min(i++, statuses.length - 1)];
      if (s instanceof Error) throw s;
      return s;
    },
    onPaid: (path) => paid.push(path),
    forMs: 10 * STATUS_POLL_EVERY_MS,
  });
  for (let tick = 0; tick < 20 && queue.length; tick++) {
    if (stopAfter !== undefined && tick === stopAfter) stop();
    const fn = queue.shift();
    clock += STATUS_POLL_EVERY_MS;
    fn?.();
    await new Promise((r) => setTimeout(r, 0));
  }
  return { asks: asked.length, paid };
}

async function main() {
const path = paidConfirmationPath("PR-913025");
eq("path", path, "/checkout/success/PR-913025");

let r = await run(["PENDING", "PENDING", "AUTHORIZED"]);
eq("AUTHORIZED on the 3rd poll → leaves once", r, { asks: 3, paid: [path] });

r = await run(["CAPTURED"]);
eq("CAPTURED on the 1st poll", r, { asks: 1, paid: [path] });

r = await run(["PENDING", "FAILED", "FAILED"]);
eq("declined never leaves; stops after the window", { left: r.paid.length, asks: r.asks }, { left: 0, asks: 10 });

r = await run([new Error("network"), null, "AUTHORIZED"]);
eq("errors and unreadable status are retried", r, { asks: 3, paid: [path] });

r = await run(["PENDING", "PENDING", "AUTHORIZED"], { stopAfter: 1 });
eq("unmounted form stops polling", r, { asks: 1, paid: [] });

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log("all passed");
}
void main();
