// A payment form that expired untouched is not a charge that may have gone
// through, although Pelecard report both as 301 — see lib/pelecard/failure.ts.
//
// Run: npx tsx scripts/check-payment-failure.ts
import { gatewayErrorMessage, paymentPageExpired } from "../src/lib/pelecard/failure";

type Case = [name: string, input: Parameters<typeof paymentPageExpired>[0], expected: boolean];

const CASES: Case[] = [
  // The founding case: the form sat open for ten minutes.
  ["form expired, no transaction", { statusCode: "301", transactionId: null, errorMessage: "Session to Pelecard Timed Out" }, true],
  ["same, other casing", { statusCode: "301", transactionId: undefined, errorMessage: "session to pelecard timed out." }, true],
  // Everything below stays on the careful side.
  ["301 with a transaction id", { statusCode: "301", transactionId: "abc", errorMessage: "Session to Pelecard Timed Out" }, false],
  ["301 with no message", { statusCode: "301", transactionId: null, errorMessage: null }, false],
  ["301 with another message", { statusCode: "301", transactionId: null, errorMessage: "Communication failure" }, false],
  ["a decline", { statusCode: "004", transactionId: "abc", errorMessage: "transaction refused." }, false],
  ["a decline that mentions a session", { statusCode: "004", transactionId: null, errorMessage: "Session to Pelecard Timed Out" }, false],
  ["nothing recorded", { statusCode: null, transactionId: null, errorMessage: null }, false],
];

let failed = 0;
for (const [name, input, expected] of CASES) {
  const got = paymentPageExpired(input);
  if (got !== expected) {
    failed++;
    console.error(`FAIL  ${name}: expected ${expected}, got ${got}`);
  }
}

const MESSAGES: [name: string, raw: unknown, expected: string | null][] = [
  ["feedback with a message", { feedback: { ErrorMessage: "Session to Pelecard Timed Out" } }, "Session to Pelecard Timed Out"],
  ["no feedback", { reason: "error feedback url" }, null],
  ["null", null, null],
  ["a string", "oops", null],
  ["message is not a string", { feedback: { ErrorMessage: 5 } }, null],
];
for (const [name, raw, expected] of MESSAGES) {
  const got = gatewayErrorMessage(raw);
  if (got !== expected) {
    failed++;
    console.error(`FAIL  ${name}: expected ${expected}, got ${got}`);
  }
}

const total = CASES.length + MESSAGES.length;
console.log(`${total - failed}/${total} passed`);
if (failed) process.exit(1);
