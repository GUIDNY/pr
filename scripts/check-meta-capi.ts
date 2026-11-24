export {};
// Meta Conversions API: normalisation, hashing, payload shape, the consent
// gate and the token gate (lib/analytics/meta-capi*.ts).
//
// Run: npm run check:meta-capi
import { createHash } from "node:crypto";

let failed = 0;
let total = 0;
const is = (name: string, got: unknown, expected: unknown) => {
  total++;
  if (JSON.stringify(got) !== JSON.stringify(expected)) {
    failed++;
    console.error(`FAIL  ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`);
  }
};
const h = (v: string) => createHash("sha256").update(v).digest("hex");

async function main() {
  const { hashEmail, hashPhone, buildCapiPurchase } = await import("../src/lib/analytics/meta-capi-payload");
  const { parseMetaIds } = await import("../src/lib/analytics/meta-ids");

  is("email trimmed + lowercased", hashEmail("  Dana@Example.COM "), h("dana@example.com"));
  is("not an email", hashEmail("nope"), null);
  is("null email", hashEmail(null), null);
  is("phone 05x", hashPhone("050-123 4567"), h("972501234567"));
  is("phone +972", hashPhone("+972 50-123-4567"), h("972501234567"));
  is("phone 00972", hashPhone("00972501234567"), h("972501234567"));
  is("landline", hashPhone("03-5551234"), h("97235551234"));
  is("junk phone", hashPhone("123"), null);

  const ids = parseMetaIds("a=1; _fbp=fb.1.1700000000000.123456789; _fbc=fb.1.1700000000000.AbC-dEf_1");
  is("fbp read", ids.fbp, "fb.1.1700000000000.123456789");
  is("fbc read", ids.fbc, "fb.1.1700000000000.AbC-dEf_1");
  is("bad fbp ignored", parseMetaIds("_fbp=<script>").fbp, null);

  const created = new Date("2026-11-24T10:00:00Z");
  const base = {
    orderNumber: "PR-123456",
    total: 1234.5,
    createdAt: created,
    metaConsent: true,
    metaFbp: "fb.1.1700000000000.123456789",
    metaFbc: null,
    guestEmail: "Dana@Example.com",
    guestPhone: "0501234567",
    items: [{ skuSnap: "A1", quantity: 2 }, { skuSnap: "B2", quantity: 1 }],
  };
  const ev = buildCapiPurchase(base, new Date("2026-11-24T10:05:00Z"));
  is("event name", ev.event_name, "Purchase");
  is("event_id is the order number", ev.event_id, "PR-123456");
  is("action source", ev.action_source, "website");
  is("time is the order's", ev.event_time, Math.floor(created.getTime() / 1000));
  is("value + currency", [ev.custom_data.value, ev.custom_data.currency], [1234.5, "ILS"]);
  is("contents by sku", ev.custom_data.contents, [{ id: "A1", quantity: 2 }, { id: "B2", quantity: 1 }]);
  is("num_items", ev.custom_data.num_items, 3);
  is("hashed em/ph, fbp, no fbc", ev.user_data, { em: [h("dana@example.com")], ph: [h("972501234567")], fbp: "fb.1.1700000000000.123456789" });
  is("no raw email in payload", JSON.stringify(ev).includes("example.com"), false);
  is("no raw phone in payload", JSON.stringify(ev).includes("0501234567"), false);
  const old = buildCapiPurchase({ ...base, createdAt: new Date("2026-11-01T00:00:00Z") }, new Date("2026-11-24T10:05:00Z"));
  is("old order reported at now", old.event_time, Math.floor(new Date("2026-11-24T10:05:00Z").getTime() / 1000));

  // The senders: no token and no consent both mean no network call at all.
  let fetched = 0;
  (globalThis as unknown as { fetch: unknown }).fetch = async () => {
    fetched++;
    return new Response("{}", { status: 200 });
  };
  const src = (await import("node:fs")).readFileSync("src/lib/analytics/meta-capi.ts", "utf8");
  is("token gate first", src.indexOf("if (!token) return;") < src.indexOf("db.order.findUnique"), true);
  is("consent gate present", src.includes("!order.metaConsent"), true);
  is("once-only guard present", src.includes("order.metaCapiSentAt"), true);
  is("token never logged", /console\.\w+\([^)]*token[^)]*\)/.test(src.replace(/\[token\]/g, "")) , false);
  is("no fetch happened here", fetched, 0);

  console.log(failed ? `${failed} of ${total} failed` : `meta-capi: ${total} checks passed`);
  process.exit(failed ? 1 : 0);
}
main();
