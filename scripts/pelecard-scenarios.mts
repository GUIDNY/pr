/* Scenario suite for the Pelecard sandbox integration.
 *
 * These are the checks that decide whether the integration is safe to point at
 * a real terminal: a forged confirmation page, a callback with no secret, a
 * callback claiming a different amount, the same callback twice. They run
 * against a running dev server and its database, and they write test orders,
 * so never point them at production.
 *
 * The scenarios that need Pelecard itself (a real payment through the sandbox
 * page, and the QAResultStatus-forced declines) are not here — they need the
 * live gateway and are run by hand from /admin/pelecard-test.
 *
 * Run:
 *   PELECARD_TEST_DB=<connection string> npx tsx scripts/pelecard-scenarios.mts
 * with the dev server running against that same database, and
 * PELECARD_CALLBACK_SECRET matching what the server was started with.
 */

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DB = process.env.PELECARD_TEST_DB ?? process.env.DATABASE_URL ?? "";
const SITE = process.env.PELECARD_TEST_SITE ?? "http://localhost:3000";
const SECRET = process.env.PELECARD_CALLBACK_SECRET ?? "";

if (!DB) throw new Error("Set PELECARD_TEST_DB (or DATABASE_URL) to the database the dev server is using");
if (!SECRET) throw new Error("Set PELECARD_CALLBACK_SECRET to the value the dev server was started with");

const adapter = new PrismaPg({ connectionString: DB });
const db = new PrismaClient({ adapter });

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name} ${detail}`);
  }
}

async function makeOrder({ total = 149.9, paymentStatus = "PENDING", withPayment = true } = {}) {
  const order = await db.order.create({
    data: {
      orderNumber: `T-${Math.random().toString(36).slice(2, 9).toUpperCase()}`,
      guestName: "בדיקה",
      guestEmail: "t@example.com",
      guestPhone: "0500000000",
      deliveryMethod: "PICKUP",
      status: paymentStatus === "CAPTURED" ? "PAID" : "PAYMENT_PENDING",
      subtotal: total,
      total,
      paymentStatus,
      paymentMethod: "PELECARD",
    },
  });
  let payment = null;
  if (withPayment) {
    payment = await db.payment.create({
      data: {
        orderId: order.id,
        provider: "PELECARD",
        amount: total,
        amountAgorot: Math.round(total * 100),
        status: paymentStatus === "CAPTURED" ? "CAPTURED" : "PENDING",
        environment: "sandbox",
        confirmationKey: "test-confirmation-key",
      },
    });
  }
  return { order, payment };
}

function callback(body: Record<string, unknown>, { secret = SECRET, failed = false }: { secret?: string; failed?: boolean } = {}) {
  const url = `${SITE}/api/pelecard/callback?secret=${encodeURIComponent(secret)}${failed ? "&failed=1" : ""}`;
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

console.log("\n--- callback authentication ---");
{
  const { order } = await makeOrder();
  const res = await callback({ ParamX: order.id, PelecardStatusCode: "000" }, { secret: "" });
  check("10 · callback with no secret is refused", res.status === 403, `(got ${res.status})`);

  const res2 = await callback({ ParamX: order.id, PelecardStatusCode: "000" }, { secret: "wrong-secret" });
  check("11 · callback with a wrong secret is refused", res2.status === 403, `(got ${res2.status})`);

  const after = (await db.order.findUnique({ where: { id: order.id } }))!;
  check("     · neither attempt touched the order", after.paymentStatus === "PENDING", `(${after.paymentStatus})`);
}

console.log("\n--- callback identifies the order ---");
{
  const res = await callback({ ParamX: "no-such-order-id", PelecardStatusCode: "000" });
  check("12 · unknown ParamX is a 404", res.status === 404, `(got ${res.status})`);

  const res2 = await callback({ PelecardStatusCode: "000" });
  check("     · missing ParamX is a 400", res2.status === 400, `(got ${res2.status})`);
}

console.log("\n--- the money checks ---");
{
  // 9. A callback claiming success for a different amount than we asked for.
  const { order } = await makeOrder({ total: 149.9 });
  const res = await callback({
    ParamX: order.id,
    PelecardStatusCode: "000",
    TotalX100: "100", // ₪1 instead of ₪149.90
    UserKey: order.id,
    PelecardTransactionId: "txn-forged",
  });
  const after = (await db.order.findUnique({ where: { id: order.id } }))!;
  const payment = (await db.payment.findFirst({ where: { orderId: order.id } }))!;
  check("9 · a mismatched amount is rejected", after.paymentStatus === "FAILED", `(${after.paymentStatus})`);
  check("    · the payment is recorded FAILED", payment.status === "FAILED", `(${payment.status})`);
  check("    · the reason is kept for the record", JSON.stringify(payment.rawResponse).includes("amount mismatch"));
  check("    · the endpoint still answers 200", res.status === 200, `(got ${res.status})`);
}

console.log("\n--- declines ---");
{
  const { order } = await makeOrder();
  await callback({ ParamX: order.id, PelecardStatusCode: "006", TotalX100: "14990", UserKey: order.id });
  const after = (await db.order.findUnique({ where: { id: order.id } }))!;
  const payment = (await db.payment.findFirst({ where: { orderId: order.id } }))!;
  check("2-4 · a non-000 status code fails the payment", after.paymentStatus === "FAILED", `(${after.paymentStatus})`);
  check("      · the gateway's code is stored for the error page", payment.pelecardStatusCode === "006");
}

console.log("\n--- idempotency ---");
{
  const { order } = await makeOrder({ paymentStatus: "CAPTURED" });
  const before = await db.orderStatusHistory.count({ where: { orderId: order.id } });
  const res = await callback({
    ParamX: order.id,
    PelecardStatusCode: "000",
    TotalX100: "14990",
    UserKey: order.id,
  });
  const paymentCount = await db.payment.count({ where: { orderId: order.id } });
  const historyCount = await db.orderStatusHistory.count({ where: { orderId: order.id } });
  check("8 · a repeated callback on a paid order is a no-op", res.status === 200 && paymentCount === 1);
  check("    · it writes no second history entry", historyCount === before, `(${before} → ${historyCount})`);
}

console.log("\n--- the forged confirmation page ---");
{
  // 7. The one that matters most: walking straight to the success page.
  const { order } = await makeOrder();
  const res = await fetch(`${SITE}/checkout/success/${order.orderNumber}`);
  const html = await res.text();
  const after = (await db.order.findUnique({ where: { id: order.id } }))!;
  check("7 · visiting the success page does not pay the order", after.paymentStatus === "PENDING", `(${after.paymentStatus})`);
  check("    · the page renders and says it is still being verified", res.status === 200 && html.includes("מאמתים את התשלום"));

  const status = await fetch(`${SITE}/api/pelecard/status?order=${order.orderNumber}`);
  const body = await status.json();
  check("    · the status endpoint reports PENDING", body.paymentStatus === "PENDING", JSON.stringify(body));
  check("    · and leaks nothing else", Object.keys(body).length === 1, JSON.stringify(body));
}

console.log("\n--- opening a payment ---");
{
  // 13. An order that is already paid cannot be paid again.
  const { order } = await makeOrder({ paymentStatus: "CAPTURED" });
  const res = await fetch(`${SITE}/api/pelecard/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId: order.id }),
  });
  check("13 · a paid order is refused with 409", res.status === 409, `(got ${res.status})`);

  const res2 = await fetch(`${SITE}/api/pelecard/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId: "nope" }),
  });
  check("    · an unknown order is a 404", res2.status === 404, `(got ${res2.status})`);

  const res3 = await fetch(`${SITE}/api/pelecard/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  check("    · a request with no order is a 400", res3.status === 400, `(got ${res3.status})`);
}

console.log("\n--- configuration guards (no server involved) ---");
{
  // These read the environment at call time, so they can be exercised here by
  // swapping the variables around a call.
  const saved = { ...process.env };
  const { pelecardConfig, toAgorot, isPelecardSandbox } = await import("../src/lib/pelecard/config");
  const { initPayment } = await import("../src/lib/pelecard/client");

  const withEnv = (env: Record<string, string | undefined>, fn: () => unknown) => {
    Object.assign(process.env, env);
    try {
      return fn();
    } finally {
      for (const key of Object.keys(env)) {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
      }
    }
  };

  const throws = (fn: () => unknown) => {
    try {
      const out = fn();
      if (out instanceof Promise) return out.then(() => false, () => true);
      return false;
    } catch {
      return true;
    }
  };

  check(
    "14 · the production gateway is refused without the acknowledgement",
    withEnv({ PELECARD_BASE_URL: "https://gateway21.pelecard.biz", PELECARD_ALLOW_PRODUCTION: undefined }, () =>
      throws(() => pelecardConfig())
    ) === true
  );

  check(
    "     · and accepted once it is set",
    withEnv(
      { PELECARD_BASE_URL: "https://gateway21.pelecard.biz", PELECARD_ALLOW_PRODUCTION: "I_UNDERSTAND" },
      () => pelecardConfig().environment
    ) === "production"
  );

  check(
    "     · a host that is neither gateway is refused",
    withEnv({ PELECARD_BASE_URL: "https://evil.example.com" }, () => throws(() => pelecardConfig())) === true
  );

  check(
    "     · so is a missing host",
    withEnv({ PELECARD_BASE_URL: undefined }, () => throws(() => pelecardConfig())) === true
  );

  check(
    "     · isPelecardSandbox() is false against production",
    withEnv(
      { PELECARD_BASE_URL: "https://gateway21.pelecard.biz", PELECARD_ALLOW_PRODUCTION: "I_UNDERSTAND" },
      () => isPelecardSandbox()
    ) === false
  );

  const qaOnProduction = await withEnv(
    { PELECARD_BASE_URL: "https://gateway21.pelecard.biz", PELECARD_ALLOW_PRODUCTION: "I_UNDERSTAND" },
    () => throws(() => initPayment({ Total: "100" }, { qaResultStatus: "000" }))
  );
  check("15 · QA simulation parameters are refused against production", qaOnProduction === true);

  check(
    "     · a malformed QAResultStatus is refused even in the sandbox",
    (await throws(() => initPayment({ Total: "100" }, { qaResultStatus: "00" }))) === true
  );

  check("17 · 149.90 becomes 14990 agorot", toAgorot(149.9) === 14990, String(toAgorot(149.9)));
  check("     · 0.1 becomes 10", toAgorot(0.1) === 10, String(toAgorot(0.1)));
  check("     · 1234.56 becomes 123456", toAgorot(1234.56) === 123456, String(toAgorot(1234.56)));
  check("     · a zero amount is refused", throws(() => toAgorot(0)) === true);
  check("     · a negative amount is refused", throws(() => toAgorot(-5)) === true);
}

console.log("\n--- the payload the checkout form actually sends ---");
{
  /* The gap that let a real bug through: every check above talks to the API
     routes directly, so none of them ever validated what the form posts. With
     the gateway on the form has no card fields, and the schema was still
     demanding a card number for a DEMO_CARD order — so every single gateway
     order was rejected before it was created, with "מספר כרטיס לא תקין". */
  const { checkoutSchema } = await import("../src/lib/order-schema");
  const base = {
    fullName: "בדיקה",
    email: "t@example.com",
    phone: "0501234567",
    deliveryMethod: "PICKUP" as const,
  };

  const gateway = checkoutSchema.safeParse({
    ...base,
    paymentMethod: "PELECARD",
    cardNumber: "",
    cardExpiry: "",
    cardCvv: "",
  });
  check(
    "a gateway order validates carrying no card details",
    gateway.success,
    gateway.success ? "" : JSON.stringify(gateway.error.issues[0])
  );

  const demoWithoutCard = checkoutSchema.safeParse({ ...base, paymentMethod: "DEMO_CARD", cardNumber: "" });
  check("a demo-flow order with no card number is still refused", !demoWithoutCard.success);

  const cash = checkoutSchema.safeParse({ ...base, paymentMethod: "CASH_ON_DELIVERY" });
  check("a cash order still validates", cash.success);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
await db.$disconnect();
process.exit(fail === 0 ? 0 : 1);
