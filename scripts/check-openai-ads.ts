// The purchase as OpenAI Ads' Conversions API receives it from our server.
//
// Written against the official reference (developers.openai.com/ads/
// conversions-api), not the spec the shop was handed on 4 November. That
// spec was measured in a browser with no access to the code, and three of
// its details would each have failed without an error:
//   - user fields are emails_sha256 / phone_numbers_sha256 /
//     external_ids_sha256, lists of hashes WE compute — not email/phone in
//     the clear for the SDK to hash;
//   - amount is an integer in minor units, agorot;
//   - Israeli numbers carry no country code as customers type them, and the
//     documented normalisation alone would hash "521234567": a number in no
//     country, matching nobody, reporting nothing wrong.
//
// Hash vectors below were computed independently (Python hashlib), not by
// the code under test.
//
// Run: npx tsx scripts/check-openai-ads.ts
import { readFileSync } from "fs";
import { createHash } from "crypto";
import {
  hashEmail,
  hashExternalId,
  hashPhone,
  openAiPurchaseEvent,
  toAgorot,
} from "../src/lib/analytics/openai-ads-event";

let failed = 0;
let checked = 0;
const fail = (m: string) => {
  console.log(`FAIL  ${m}`);
  failed++;
};
const expect = (label: string, actual: unknown, wanted: unknown) => {
  checked++;
  if (actual !== wanted) fail(`${label}: got ${String(actual)}, wanted ${String(wanted)}`);
};

const EMAIL = "973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b"; // test@example.com
const IL_PHONE = "14497f050217d427077fea7700606fb29d722886c89133f8d936170229096d5d"; // 972521234567
const USER = "9cfc09aa76ff341a02ddecbf0bb1bff2074442bb4c4985009d271efc3ba5ffed"; // user_abc

/* ── email: trim and lowercase ──────────────────────────────────────── */
expect("email hashes to the reference vector", hashEmail("test@example.com"), EMAIL);
expect("…case and whitespace do not change it", hashEmail("  Test@Example.COM "), EMAIL);
expect("no address, no hash", hashEmail(""), null);
expect("…nor for something that is not one", hashEmail("not-an-email"), null);
expect("…nor for null", hashEmail(null), null);

/* ── phone: the Israeli trap ────────────────────────────────────────── */
for (const typed of ["0521234567", "052-123-4567", "052 1234567", "+972521234567", "972-52-123-4567"]) {
  expect(`"${typed}" hashes with the country code`, hashPhone(typed), IL_PHONE);
}
/* The failure this exists for: the documented rule applied to a local
   number strips the zero and keeps no country code. */
const WRONG = createHash("sha256").update("521234567").digest("hex");
checked++;
if (hashPhone("0521234567") === WRONG) fail("a local number must not be hashed as 521234567, with no country");
expect("an unrecognisable number is not guessed", hashPhone("12345"), null);
expect("no phone, no hash", hashPhone(null), null);

/* ── external id: trim only, case kept ──────────────────────────────── */
expect("external id hashes to the reference vector", hashExternalId("user_abc"), USER);
expect("…trimmed", hashExternalId("  user_abc "), USER);
checked++;
if (hashExternalId("USER_ABC") === USER) fail("external id must keep its case");
expect("a guest has no external id", hashExternalId(null), null);

/* ── minor units ─────────────────────────────────────────────────────── */
expect("₪3,990 is 399000 agorot", toAgorot(3990), 399000);
expect("float noise is rounded away", toAgorot(1234.5), 123450);
expect("…including the classic one", toAgorot(0.1 + 0.2), 30);

/* ── the event ──────────────────────────────────────────────────────── */
const ev = openAiPurchaseEvent(
  {
    orderNumber: "PR-996964",
    subtotal: 4440,
    discountTotal: 450,
    email: "Test@Example.com",
    phone: "052-123-4567",
    userId: "user_abc",
    items: [{ sku: "1358", title: "מדיח בוש", price: 3990, quantity: 1 }],
  },
  "https://buytoday.co.il/",
  1793800000000,
);
/* Deduplication with the GTM tag: same type, and id = transaction_id =
   the order number. Either one wrong and every sale counts twice. */
expect("id is the order number — the pixel's event_id", ev.id, "PR-996964");
expect("type matches the GTM tag", ev.type, "order_created");
expect("web events must carry a source url", ev.source_url, "https://buytoday.co.il/checkout/success");
expect("action source", ev.action_source, "web");
expect("goods after discount, in agorot — the tag's convention", ev.data.amount, 399000);
expect("currency", ev.data.currency, "ILS");
expect("contents id is the SKU, as the tag and the feed send it", ev.data.contents[0].id, "1358");
expect("per-unit amount in agorot", ev.data.contents[0].amount, 399000);
expect("user is nested in the event, hashed", ev.user?.emails_sha256?.[0], EMAIL);
expect("…phone with country code", ev.user?.phone_numbers_sha256?.[0], IL_PHONE);
expect("…external id", ev.user?.external_ids_sha256?.[0], USER);
checked++;
if (JSON.stringify(ev).includes("example.com") || JSON.stringify(ev).includes("1234567")) {
  fail("no email or phone may leave in the clear");
}

/* A guest with nothing usable sends no empty user object. */
const bare = openAiPurchaseEvent(
  { orderNumber: "PR-1", subtotal: 100, discountTotal: 0, email: null, phone: null, userId: null, items: [] },
  "https://buytoday.co.il",
  0,
);
expect("no identifiers, no user object", "user" in bare, false);

/* ── wiring ─────────────────────────────────────────────────────────── */
/* Beside every GA4 server report, so the two cannot drift apart, and
   gated on the consent record. Read from source: the sender needs a
   database to import. */
const cb = readFileSync("src/app/api/pelecard/callback/route.ts", "utf8");
const so = readFileSync("src/actions/seller-orders.ts", "utf8");
const sender = readFileSync("src/lib/analytics/openai-ads-purchase.ts", "utf8");
expect("gateway callback reports it", (cb.match(/sendPurchaseToOpenAiAds\(/g) ?? []).length, 1);
expect("…once per GA4 report in seller-orders", (so.match(/sendPurchaseToOpenAiAds\(/g) ?? []).length, (so.match(/sendPurchaseToGa4\(/g) ?? []).length);
expect("only with consent on record", sender.includes("!order.gaClientId) return"), true);
expect("silent without a key", sender.includes("if (!apiKey || !pixelId) return"), true);

console.log(
  `${checked - failed}/${checked} passed  (identifiers hashed to reference vectors, Israeli phones keep 972, ` +
    `amounts in agorot, id = order number so the GTM tag's copy deduplicates, consent required)`,
);
process.exit(failed === 0 ? 0 : 1);
