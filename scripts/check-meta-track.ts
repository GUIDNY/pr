export {};
// A Meta event raised before the pixel exists is held until it does, not
// dropped — the purchase on the confirmation page was lost to exactly that
// (lib/analytics/meta.ts).
//
// Run: npm run check:meta-track
const store = new Map<string, string>([["prec-consent", "granted"]]);
const calls: unknown[][] = [];
(globalThis as unknown as { window: unknown }).window = {
  localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
  fbq: undefined,
  setTimeout,
};
const w = (globalThis as unknown as { window: { fbq?: (...a: unknown[]) => void } }).window;

let failed = 0;
let total = 0;
const is = (name: string, got: unknown, expected: unknown) => {
  total++;
  if (JSON.stringify(got) !== JSON.stringify(expected)) {
    failed++;
    console.error(`FAIL  ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`);
  }
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { trackMeta } = await import("../src/lib/analytics/meta");
  let sent = 0;

  // The pixel arrives half a second after the call.
  trackMeta("Purchase", { value: 100, currency: "ILS" }, "PR-1", () => sent++);
  is("nothing sent while the pixel is missing", calls.length, 0);
  await wait(500);
  w.fbq = (...a: unknown[]) => void calls.push(a);
  await wait(600);
  is("sent once when the pixel appears", calls.length, 1);
  is("name, params and eventID", calls[0], ["track", "Purchase", { value: 100, currency: "ILS" }, { eventID: "PR-1" }]);
  is("onSent ran once", sent, 1);

  // The pixel is already there.
  trackMeta("Purchase", { value: 5 }, "PR-2", () => sent++);
  is("sent at once when the pixel exists", calls.length, 2);
  is("onSent again", sent, 2);

  console.log(`${total - failed}/${total} passed`);
  if (failed) process.exit(1);
}
void main();
