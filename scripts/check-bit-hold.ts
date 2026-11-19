/**
 * A bit payment is not sent to the card capture call.
 *
 * PR-577373 (9 November, 1,079 ₪, bit through Pelecard): "אשר תשלום וגבה"
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
import { bitHoldFrom, bitHoldMessage } from "../src/lib/pelecard/bit-hold";

let failures = 0;
function check(label: string, ok: boolean) {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}`);
  if (!ok) failures++;
}

const pr577373 = {
  details: {
    RecordSource: "104",
    RecordSourceDescription: "Gama Bit",
    CreditCardNumber: "***GAMA***",
    Token: "0123456789",
    TransactionPelecardId: "3184961557",
    DebitTotal: "107900",
    JParam: "5",
  },
  rawBody: JSON.stringify({
    StatusCode: "000",
    ErrorMessage: "bit operation success",
    ResultData: { TransactionPelecardId: "3184961557", RecordSource: "104" },
    GamaData: { GamaPaymentNetwork: "bit", GamaLastStatus: "approved_temporary" },
  }),
  feedback: { PelecardTransactionNumber: "3184961557", PelecardStatusCode: "000" },
  validation: 1,
};

console.log("\nThe founding case");
const bit = bitHoldFrom(pr577373);
check("PR-577373 is recognised as bit", bit !== null);
check("…with its Pelecard transaction number", bit?.transactionNumber === "3184961557");
check("…and Gama's status", bit?.gamaStatus === "approved_temporary");
check("the message names the transaction", !!bit && bitHoldMessage(bit).includes("3184961557"));
check("the message says to finish it in Pelecard", !!bit && bitHoldMessage(bit).includes("יש להשלים בממשק פלאקארד"));

console.log("\nOnly one of the signals is enough");
check("RecordSource 104 alone", bitHoldFrom({ details: { RecordSource: "104" } }) !== null);
check("the description alone", bitHoldFrom({ details: { RecordSourceDescription: "Gama Bit" } }) !== null);
check(
  "Gama's network alone",
  bitHoldFrom({ details: {}, rawBody: JSON.stringify({ GamaData: { GamaPaymentNetwork: "bit" } }) }) !== null,
);
check("a rawResponse stored as a string", bitHoldFrom(JSON.stringify(pr577373)) !== null);

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

console.log(failures ? `\n${failures} failed.` : "\nA bit payment is not sent to the card capture call.");
process.exit(failures ? 1 : 0);
