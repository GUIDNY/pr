/**
 * A bit payment is not sent to the card capture call.
 *
 * A bit order from 9 November (bit through Pelecard): "אשר תשלום וגבה"
 * sent it to /services/CompleteDebitByUid and Pelecard answered 510 — Record
 * not found. That call completes a card J5 hold; bit has no card hold to
 * complete. The rawResponse shapes below are cut down from real rows.
 *
 * No database and no network.
 *
 *   npm run check:bit-hold
 */

import { readFileSync } from "fs";
import { join } from "path";
import { bitHoldFrom, bitHoldMessage, daysSince, paidWith, paidWithFrom } from "../src/lib/pelecard/bit-hold";
import { readPelecardStatus } from "../src/lib/pelecard/transaction-status";

let failures = 0;
function check(label: string, ok: boolean) {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}`);
  if (!ok) failures++;
}

const bitOrder = {
  details: {
    RecordSource: "104",
    RecordSourceDescription: "Gama Bit",
    CreditCardNumber: "***GAMA***",
    Token: "0123456789",
    TransactionPelecardId: "1234567890",
    DebitTotal: "100000",
    JParam: "5",
  },
  rawBody: JSON.stringify({
    StatusCode: "000",
    ErrorMessage: "bit operation success",
    ResultData: { TransactionPelecardId: "1234567890", RecordSource: "104" },
    GamaData: { GamaPaymentNetwork: "bit", GamaLastStatus: "approved_temporary" },
  }),
  feedback: { PelecardTransactionNumber: "1234567890", PelecardStatusCode: "000" },
  validation: 1,
};

console.log("\nThe founding case");
const bit = bitHoldFrom(bitOrder);
check("the 9 November bit order is recognised as bit", bit !== null);
check("…with its Pelecard transaction number", bit?.transactionNumber === "1234567890");
check("…and Gama's status", bit?.gamaStatus === "approved_temporary");
check("the message names the transaction", !!bit && bitHoldMessage(bit).includes("1234567890"));
check("the message says to finish it in Pelecard", !!bit && bitHoldMessage(bit).includes("יש להשלים בממשק פלאקארד"));

console.log("\nOnly one of the signals is enough");
check("RecordSource 104 alone", bitHoldFrom({ details: { RecordSource: "104" } }) !== null);
check("the description alone", bitHoldFrom({ details: { RecordSourceDescription: "Gama Bit" } }) !== null);
check(
  "Gama's network alone",
  bitHoldFrom({ details: {}, rawBody: JSON.stringify({ GamaData: { GamaPaymentNetwork: "bit" } }) }) !== null,
);
check("a rawResponse stored as a string", bitHoldFrom(JSON.stringify(bitOrder)) !== null);

console.log("\nWhat is not bit, and must still go to the card capture");
check("a regular card", bitHoldFrom({ details: { RecordSource: "101", RecordSourceDescription: "Regular" } }) === null);
check("Apple Pay", bitHoldFrom({ details: { RecordSource: "103", RecordSourceDescription: "Apple Pay" } }) === null);
check("a card row with source 4 and no description", bitHoldFrom({ details: { RecordSource: "4", RecordSourceDescription: "" } }) === null);
check("no rawResponse at all", bitHoldFrom(null) === null);
check("rawResponse that is not JSON", bitHoldFrom("not json") === null);

console.log("\nThe wiring");
const root = join(__dirname, "..");
const action = readFileSync(join(root, "src/actions/seller-orders.ts"), "utf8");
const approve = action.slice(action.indexOf("export async function approveOrderAction"));
const asked = approve.indexOf("bitHoldFrom(");
const refused = approve.indexOf("bitHoldMessage(bit)");
const sent = approve.indexOf("completeDebitByUid(");
check("the approve button asks whether the hold is bit", asked > 0);
check("…and refuses it before the card capture call", refused > asked && sent > refused);
check("bit never reaches completeDebitByUid", /hold\.provider === "DEMO" \|\| bit\s*\?/.test(approve));

const page = readFileSync(join(root, "src/components/admin/seller-order-page.tsx"), "utf8");
check("the order page shows the bit explanation", page.includes("תשלום ביט – יש להשלים בממשק פלאקארד"));
check("the order page does not show the card expiry for bit", page.includes("!bitHold && order.paid?.holdExpiresAt"));

console.log("\nThe badge: how the customer paid (codes from our own rows)");
check("104 / Gama Bit → bit", paidWith("104", "Gama Bit") === "BIT");
check("the bit order's whole reply → bit", paidWithFrom(bitOrder) === "BIT");
check("103 / Apple Pay → Apple Pay", paidWith("103", "Apple Pay") === "APPLE_PAY");
check("4 with no description → card", paidWith("4", "") === "CARD");
check("101 / Regular → card", paidWith("101", "Regular") === "CARD");
check("Google Pay by its description", paidWith(null, "Google Pay") === "GOOGLE_PAY");
check("an unknown code shows no badge", paidWith("999", "") === null);
check("nothing at all shows no badge", paidWithFrom(null) === null);

console.log("\nThe status check reads, and only reads");
const gamaAnswer = readPelecardStatus({
  StatusCode: "000",
  ErrorMessage: "bit operation success",
  ResultData: { TransactionUpdateTime: "09/11/2026 19:27:38" },
  GamaData: { GamaLastStatus: "approved_temporary" },
});
check("approved_temporary reads as a temporary approval, not charged", gamaAnswer.summary === "ביט: אישור זמני – עוד לא נגבה");
check("…with Pelecard's update time", gamaAnswer.updatedAt === "09/11/2026 19:27:38");
check("an unknown Gama status is shown as it came", readPelecardStatus({ GamaData: { GamaLastStatus: "xyz" } }).summary === "ביט: xyz");
check("a card answer shows Pelecard's own code", readPelecardStatus({ StatusCode: "000", ErrorMessage: "ok" }).summary === "פלאקארד: 000 – ok");
check("an empty answer claims nothing", readPelecardStatus({}).summary === null);
check("9 November to 19 November is 10 days", daysSince(new Date("2026-11-09T17:27:40Z"), new Date("2026-11-19T18:00:00Z")) === 10);

const statusAction = readFileSync(join(root, "src/actions/pelecard-status.ts"), "utf8");
check("the status button calls GetTransaction", statusAction.includes("getTransaction("));
check(
  "…and nothing that moves money",
  !/completeDebitByUid|DebitRegularType|DeleteIshur|Reversal|DeleteTran|payment\.update|order\.update/.test(statusAction),
);
check("the list shows the badge", readFileSync(join(root, "src/components/admin/seller-order-row.tsx"), "utf8").includes("PAID_WITH_LABELS"));
check("a bit order says to ask Pelecard", page.includes("יש לברר מול פלאקארד את מצב העסקה"));

check("a bit order does not say the hold is on a card", page.includes("הלקוח אישר תשלום בביט והכסף עדיין לא נגבה"));

console.log(failures ? `\n${failures} failed.` : "\nA bit payment is not sent to the card capture call.");
process.exit(failures ? 1 : 0);
