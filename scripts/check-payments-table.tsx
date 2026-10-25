/**
 * Renders the payments table against the three JSON shapes that are really in
 * that column — a gateway approval, a gateway failure, and a row settled away
 * from the gateway — and asserts that the fields a person needs while a
 * customer is on the phone come out of each.
 *
 * The shapes were read off the live database. The CONTENT is invented, and
 * that distinction is the point: this repository is public, and the rows these
 * were modelled on belong to customers. A cardholder's name and the last four
 * digits of their card do not get committed to make a fixture read more
 * convincingly. Every value below is synthetic — 4111 is the test PAN every
 * payment network publishes for exactly this.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { PelecardPayments } from "@/components/admin/pelecard-payments";

const approved = {
  feedback: {
    ApprovalNo: "0000123",
    ErrorMessage: "operation success",
    PelecardStatusCode: "000",
    PelecardTransactionId: "00000000-0000-4000-8000-000000000001",
    ResultData: {
      CardEnName: "Visa",
      CardHebrewName: "ויזה זהב",
      CardHolderName: "ישראל ישראלי",
      CreditCardNumber: "411111******1111",
      DebitApproveNumber: "0000123",
      TotalPayments: "1",
      Auth3DSTranStatus: "Y",
    },
  },
  validation: 1,
};

const failed3ds = {
  reason: "error feedback url",
  feedback: {
    ErrorMessage: "3DS process failed (The transaction has been denied by the Gateway because 3D secure Authentication failed.)",
    PelecardStatusCode: "650",
    ResultData: { Auth3DSTranStatus: "N", AuthCodeSolek: "", CreditCardNumber: "" },
  },
};

const failedTimeout = {
  reason: "error feedback url",
  feedback: {
    ErrorMessage: "Session to Pelecard Timed Out",
    PelecardStatusCode: "301",
    ResultData: { ConfirmationKey: "0000000000000000000000000000abcd" },
  },
};

const manual = { manual: { at: "2026-10-15T11:12:04.055Z", by: "user_000000000000", method: "PHONE_CARD", reference: null } };

const rows = [
  { id: "1", createdAt: new Date("2026-10-23T20:20:10Z"), amount: 290, status: "AUTHORIZED", pelecardStatusCode: "000", pelecardTransactionId: "00000000", rawResponse: approved, order: { orderNumber: "PR-000001", status: "NEW", paymentStatus: "AUTHORIZED" } },
  { id: "2", createdAt: new Date("2026-10-14T20:55:50Z"), amount: 1790, status: "FAILED", pelecardStatusCode: "650", pelecardTransactionId: "00000000", rawResponse: failed3ds, order: { orderNumber: "PR-000002", status: "PAYMENT_FAILED", paymentStatus: "FAILED" } },
  { id: "3", createdAt: new Date("2026-10-24T11:19:35Z"), amount: 3800, status: "FAILED", pelecardStatusCode: "301", pelecardTransactionId: null, rawResponse: failedTimeout, order: { orderNumber: "PR-000003", status: "PAYMENT_FAILED", paymentStatus: "FAILED" } },
  { id: "4", createdAt: new Date("2026-10-15T11:12:04Z"), amount: 1790, status: "CAPTURED", pelecardStatusCode: null, pelecardTransactionId: null, rawResponse: manual, order: { orderNumber: "PR-000004", status: "NEW", paymentStatus: "CAPTURED" } },
  { id: "5", createdAt: new Date("2026-10-14T20:45:31Z"), amount: 1790, status: "PENDING", pelecardStatusCode: null, pelecardTransactionId: null, rawResponse: null, order: { orderNumber: "PR-000005", status: "PAYMENT_PENDING", paymentStatus: "PENDING" } },
];

const html = renderToStaticMarkup(<PelecardPayments payments={rows} />);

/* THE RAW ANSWER IS STRIPPED BEFORE ANYTHING IS ASSERTED, and this is the
   whole reason these checks mean anything. Every value the table pulls out
   also appears inside the collapsed JSON dump, so a search of the page finds
   the approval number whether the column renders it or not — the first version
   of this file passed with the approval number hard-coded to null. What is
   asserted below is what a person can actually read without opening anything. */
const visible = html.replace(/<pre[\s\S]*?<\/pre>/g, "");

let failures = 0;
function has(what: string, needle: string) {
  const ok = visible.includes(needle);
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${what}`);
}

function lacks(what: string, needle: string) {
  const ok = !visible.includes(needle);
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${what}`);
}

console.log("\nAn approved payment answers the questions asked on the phone");
has("the card is named", "ויזה זהב");
has("the last four digits", "1111");
has("the approval number", "0000123");
has("the cardholder", "ישראל ישראלי");

console.log("\nA failure says why, in Pelecard's own words");
has("3DS failure is printed", "3D secure Authentication failed");
has("the 650 code is shown", "650");
has("a timeout is printed too", "Session to Pelecard Timed Out");

console.log("\nA payment settled away from the gateway says so");
has("labelled rather than left blank", "סומן ידנית");
has("the method is kept", "PHONE_CARD");
has("and it does not pretend to be a gateway answer", "שולם מחוץ לסליקה");

console.log("\nThe rest");
has("an order with no answer at all still appears", "PR-000005");
has("every order number is listed", "PR-000001");
lacks("\"operation success\" is not printed at a person — it is not news", "operation success");
lacks("nor is a full card number, even a masked one", "411111******1111");

console.log(failures === 0 ? "\nThe payments table reads all three shapes.\n" : `\n${failures} payment-table check(s) BROKEN.\n`);
process.exit(failures === 0 ? 0 : 1);
