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

async function makeOrder({
  total = 149.9,
  paymentStatus = "PENDING",
  withPayment = true,
  status,
}: { total?: number; paymentStatus?: string; withPayment?: boolean; status?: string } = {}) {
  status ??= paymentStatus === "CAPTURED" ? "PAID" : "PAYMENT_PENDING";
  const order = await db.order.create({
    data: {
      orderNumber: `T-${Math.random().toString(36).slice(2, 9).toUpperCase()}`,
      guestName: "בדיקה",
      guestEmail: "t@example.com",
      guestPhone: "0500000000",
      deliveryMethod: "PICKUP",
      status,
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

console.log("\n--- the shape the gateway actually posts ---");
{
  /* The first live transaction posted a body this route could not read, so it
     answered 400 twice, Pelecard treated the unacknowledged notification as a
     failed transaction, and the customer was sent to the error page. A
     notification we cannot parse must still be a notification we act on. */
  const { order } = await makeOrder({ total: 149.9 });
  const url = `${SITE}/api/pelecard/callback?secret=${encodeURIComponent(SECRET)}&order=${order.id}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      PelecardStatusCode: "006",
      PelecardTransactionId: "txn-form-encoded",
      ParamX: order.id,
      UserKey: order.id,
      TotalX100: "14990",
    }).toString(),
  });
  const after = (await db.order.findUnique({ where: { id: order.id } }))!;
  const payment = (await db.payment.findFirst({ where: { orderId: order.id } }))!;
  check("a form-encoded callback is understood", res.status === 200, `(got ${res.status})`);
  check("    · and the decline is recorded", after.paymentStatus === "FAILED", `(${after.paymentStatus})`);
  check("    · with the gateway's status code", payment.pelecardStatusCode === "006", `(${payment.pelecardStatusCode})`);

  const { order: order2 } = await makeOrder({ total: 149.9 });
  const res2 = await fetch(`${SITE}/api/pelecard/callback?secret=${encodeURIComponent(SECRET)}&order=${order2.id}&failed=1`, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: "%%%not-parsable%%%",
  });
  const after2 = (await db.order.findUnique({ where: { id: order2.id } }))!;
  check("an unreadable body still fails the order rather than 400", res2.status === 200 && after2.paymentStatus === "FAILED", `(${res2.status}/${after2.paymentStatus})`);

  const res3 = await fetch(`${SITE}/api/pelecard/callback?secret=${encodeURIComponent(SECRET)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  check("a callback with no order reference at all is still refused", res3.status === 400, `(got ${res3.status})`);
}

console.log("\n--- the envelope the gateway actually posts ---");
{
  /* Captured from the first sandbox transaction that reached the callback.
     Nothing this route reads is where the documentation for the browser return
     puts it: the order id is AdditionalDetailsParamX, the amount is DebitTotal,
     the approval number is DebitApproveNumber, and the status code is one level
     up. Read flat they are all undefined — so an approved payment would have
     been failed on `undefined !== "000"` and the customer sent to the error
     page for a card that was charged.

     These assertions use the real envelope for exactly the reason the previous
     round of them missed the bug: every other check in this file posts a shape
     we invented. */
  const envelope = (orderId: string, statusCode: string, totalAgorot: string, errorMessage = "") => ({
    StatusCode: statusCode,
    ErrorMessage: errorMessage,
    ResultData: {
      TransactionId: "5c3f9c94-529c-43f0-a1ca-949ef5dc9c62",
      ShvaResult: statusCode,
      AdditionalDetailsParamX: orderId,
      UserKey: orderId,
      DebitApproveNumber: statusCode === "000" ? "1234567" : "0000000",
      ConfirmationKey: "test-confirmation-key",
      VoucherId: "86-001-001",
      TransactionPelecardId: "3081963254",
      CreditCardNumber: "45******4580",
      CreditCardCompanyClearer: "2",
      DebitTotal: totalAgorot,
      TotalPayments: "1",
    },
  });

  const reasonOf = async (orderId: string) => {
    const payment = (await db.payment.findFirst({ where: { orderId } }))!;
    return (payment.rawResponse as { reason?: string } | null)?.reason ?? "";
  };

  // The order is found from the body alone — no &order= to fall back on.
  const { order } = await makeOrder({ total: 149.9 });
  const res = await callback(envelope(order.id, "125", "14990", "terminal not allowed to accept Imex/36 transaction."));
  const after = (await db.order.findUnique({ where: { id: order.id } }))!;
  const payment = (await db.payment.findFirst({ where: { orderId: order.id } }))!;
  const history = await db.orderStatusHistory.findFirst({
    where: { orderId: order.id },
    orderBy: { createdAt: "desc" },
  });
  check("18 · the nested envelope identifies its own order", res.status === 200, `(got ${res.status})`);
  check("     · the decline is recorded", after.paymentStatus === "FAILED", `(${after.paymentStatus})`);
  check("     · with the code from one level up", payment.pelecardStatusCode === "125", `(${payment.pelecardStatusCode})`);
  check("     · and the GUID, not the numeric id", payment.pelecardTransactionId === "5c3f9c94-529c-43f0-a1ca-949ef5dc9c62", `(${payment.pelecardTransactionId})`);
  check("     · the note carries Pelecard's own words", (history?.note ?? "").includes("terminal not allowed"), history?.note ?? "");

  // The amount is read from DebitTotal. Wrong amount → caught.
  const { order: cheap } = await makeOrder({ total: 149.9 });
  await callback(envelope(cheap.id, "000", "100"));
  const cheapReason = await reasonOf(cheap.id);
  check("19 · a nested envelope claiming ₪1 for a ₪149.90 order is caught", cheapReason === "amount mismatch", cheapReason);

  /* Right amount → it gets past the amount check. It still fails here, because
     ValidateByUniqueKey needs the real gateway and this suite runs without it;
     the point of the assertion is that the reason is no longer the amount. A
     route reading TotalX100 flat would compare NaN to 14990 and stop here. */
  const { order: correct } = await makeOrder({ total: 149.9 });
  await callback(envelope(correct.id, "000", "14990"));
  const reason = await reasonOf(correct.id);
  check("     · and the matching amount passes that check", reason !== "amount mismatch" && reason !== "missing keys", reason);
}

console.log("\n--- normalizeFeedback ---");
{
  const { normalizeFeedback } = await import("../src/lib/pelecard/client");

  const nested = normalizeFeedback({
    StatusCode: "000",
    ErrorMessage: "",
    ResultData: {
      TransactionId: "guid-1",
      TransactionPelecardId: "3081963254",
      AdditionalDetailsParamX: "order-1",
      UserKey: "order-1",
      DebitTotal: "14990",
      DebitApproveNumber: "1234567",
      ConfirmationKey: "key-1",
      ShvaResult: "000",
    },
  });
  check("20 · the nested envelope is flattened", nested.PelecardStatusCode === "000" && nested.ParamX === "order-1" && nested.TotalX100 === "14990");
  check("     · the two transaction ids are kept apart", nested.PelecardTransactionId === "guid-1" && nested.PelecardTransactionNumber === "3081963254");
  check("     · the approval number is found", nested.ApprovalNo === "1234567");

  const flat = normalizeFeedback({ PelecardStatusCode: "000", ParamX: "order-2", TotalX100: "500" });
  check("     · a flat body is left as it is", flat.PelecardStatusCode === "000" && flat.ParamX === "order-2" && flat.TotalX100 === "500");

  const empty = normalizeFeedback({ StatusCode: "125", ErrorMessage: "nope", ResultData: {} });
  check("     · an empty ResultData yields no false order reference", empty.ParamX === undefined && empty.PelecardStatusCode === "125");
}

console.log("\n--- a failed payment is visible as failed ---");
{
  /* paymentStatus went to FAILED while status stayed PAYMENT_PENDING, so in the
     admin list a declined order looked exactly like one the customer is still
     paying for — and the history read PAYMENT_PENDING → PAYMENT_PENDING. */
  const envelope = (orderId: string, statusCode: string, errorMessage = "") => ({
    StatusCode: statusCode,
    ErrorMessage: errorMessage,
    ResultData: {
      TransactionId: "guid-failed-1",
      TransactionPelecardId: "3081963254",
      AdditionalDetailsParamX: orderId,
      UserKey: orderId,
      DebitTotal: "14990",
      DebitApproveNumber: "0000000",
      ConfirmationKey: "test-confirmation-key",
      VoucherId: "86-001-001",
      CreditCardNumber: "45******4580",
      CreditCardCompanyClearer: "2",
      TotalPayments: "1",
      ShvaResult: statusCode,
    },
  });

  const { order } = await makeOrder({ total: 149.9 });
  await callback(envelope(order.id, "125", "terminal not allowed to accept Imex/36 transaction."));
  const after = (await db.order.findUnique({ where: { id: order.id } }))!;
  const payment = (await db.payment.findFirst({ where: { orderId: order.id } }))!;
  const history = (await db.orderStatusHistory.findFirst({
    where: { orderId: order.id },
    orderBy: { createdAt: "desc" },
  }))!;

  check("21 · the order moves to PAYMENT_FAILED", after.status === "PAYMENT_FAILED", `(${after.status})`);
  check("     · and the history records the move", history.fromStatus === "PAYMENT_PENDING" && history.toStatus === "PAYMENT_FAILED", `(${history.fromStatus} → ${history.toStatus})`);

  // The columns exist to be queried and shown; a decline fills them too.
  check("22 · the last four digits are lifted out", payment.cardLast4 === "4580", `(${payment.cardLast4})`);
  check("     · so is the card company, from its code", payment.clearerName === "ויזה כאל", `(${payment.clearerName})`);
  check("     · and the voucher", payment.voucherId === "86-001-001", `(${payment.voucherId})`);
  check("     · and the instalment count", payment.totalPayments === 1, `(${payment.totalPayments})`);
  check("     · clearerName is not this shop's own name", payment.clearerName !== "פ.ר אלקטרוניקה");
  check("     · the transaction id is the GUID GetTransaction takes", payment.pelecardTransactionId === "guid-failed-1", `(${payment.pelecardTransactionId})`);
  check("     · the numeric id is kept as the reference", payment.reference === "3081963254", `(${payment.reference})`);

  /* A late or redelivered failure must not drag an order that has moved on.
     Pelecard can redeliver, and an order paid by other means and already sent
     is not un-shipped by a notification about the card attempt that failed. */
  const { order: shipped } = await makeOrder({ total: 149.9, status: "SHIPPED" });
  await callback(envelope(shipped.id, "033"));
  const afterShipped = (await db.order.findUnique({ where: { id: shipped.id } }))!;
  check("23 · a late failure does not drag a shipped order backwards", afterShipped.status === "SHIPPED", `(${afterShipped.status})`);
  check("     · but the payment is still recorded failed", afterShipped.paymentStatus === "FAILED", `(${afterShipped.paymentStatus})`);
}

console.log("\n--- SupportedCards ---");
{
  /* Pelecard rejects the whole init with ErrCode 999 if one of the five is
     missing or blank, and leaving a brand the terminal cannot take set to True
     is what produced `125 — terminal not allowed to accept Imex/36`. */
  const { SUPPORTED_CARDS } = await import("../src/lib/pelecard/client");
  const brands = ["Amex", "Diners", "Isra", "Master", "Visa"];
  const values = SUPPORTED_CARDS as Record<string, string>;
  check("24 · all five brands are named", brands.every((b) => values[b] === "True" || values[b] === "False"), JSON.stringify(values));
  check("     · the two the terminal cannot take are False", values.Amex === "False" && values.Diners === "False");
  check("     · the three it can are True", values.Isra === "True" && values.Master === "True" && values.Visa === "True");

  const { readFileSync } = await import("node:fs");
  for (const file of ["src/app/api/pelecard/checkout/route.ts", "src/actions/pelecard-test.ts"]) {
    check(`     · ${file} sends it`, readFileSync(file, "utf8").includes("SupportedCards: SUPPORTED_CARDS"));
  }
}

console.log(`\n${pass} passed, ${fail} failed\n`);
await db.$disconnect();
process.exit(fail === 0 ? 0 : 1);
