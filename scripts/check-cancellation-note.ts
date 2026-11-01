// The note that tells a customer the order cannot be supplied.
//
// The owner's own wording, written on 1 November, with one line that
// cannot be fixed text:
//
//   "כרטיס האשראי שלך לא יחויב, ומסגרת האשראי שנתפסה תשוחרר"
//
// That is exactly right for a card that was AUTHORIZED — a hold, which
// Pelecard releases — and it is a false statement to a customer whose
// card was already CAPTURED. The two are one enum value apart on the
// order and look alike on the order page, so a paragraph pasted from a
// template would eventually promise "you will not be charged" to
// somebody already charged, in writing, about their money.
//
// Run: npx tsx scripts/check-cancellation-note.ts
import {
  cancellationMessage,
  cancellationMoneyFor,
} from "../src/lib/notify/cancellation";

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
const has = (label: string, body: string, text: string, wanted = true) => {
  checked++;
  if (body.includes(text) !== wanted) {
    fail(`${label}: ${wanted ? "missing" : "must not contain"} ${JSON.stringify(text)}`);
  }
};

const order = (paymentStatus: string | null) => ({
  orderNumber: "PR-996964",
  customerName: "ששון כהן",
  paymentStatus,
});

/* ── the money sentence follows the money ───────────────────────────── */
expect("a hold is released", cancellationMoneyFor("AUTHORIZED"), "HOLD_RELEASED");
expect("a charge is refunded", cancellationMoneyFor("CAPTURED"), "REFUND");
expect("a refund already running is still a refund", cancellationMoneyFor("REFUND_PENDING"), "REFUND");
expect("and one already paid out", cancellationMoneyFor("REFUNDED"), "REFUND");
expect("nothing taken yet", cancellationMoneyFor("PENDING"), "NOTHING_TAKEN");
expect("a payment that failed took nothing", cancellationMoneyFor("FAILED"), "NOTHING_TAKEN");
expect("no payment at all", cancellationMoneyFor(null), "NOTHING_TAKEN");
expect("a status we do not know gets no promise", cancellationMoneyFor("SOMETHING_NEW"), "NOTHING_TAKEN");

/* THE ONE THAT MATTERS: an already-charged customer must never be told
   their card will not be charged. */
const captured = cancellationMessage(order("CAPTURED")).body;
has("a charged customer is not told the card will not be charged", captured, "לא יחויב", false);
has("…they are told the money is coming back", captured, "יוחזר לכרטיס האשראי שלך במלואו");
has("…and no hold is promised either", captured, "מסגרת האשראי", false);

const authorized = cancellationMessage(order("AUTHORIZED")).body;
has("a held card gets the owner's own sentence", authorized, "כרטיס האשראי שלך לא יחויב, ומסגרת האשראי שנתפסה תשוחרר באופן מיידי.");
has("…and is not promised a refund it will never see", authorized, "יוחזר", false);

const pending = cancellationMessage(order("PENDING")).body;
has("nothing taken says only that", pending, "לא בוצע חיוב");
has("…with no hold to release", pending, "תשוחרר", false);
has("…and no refund to wait for", pending, "יוחזר", false);

/* ── the wording the owner wrote, kept verbatim ─────────────────────── */
has("the greeting", authorized, "שלום ששון,");
has("the reason, with the order number in it", authorized, "לצערנו, נפלה טעות בהזמנה מספר PR-996964, והמוצר שהזמנת אינו זמין עוד במלאי.");
has("the apology", authorized, "אנו מתנצלים על אי הנוחות ומודים לך מראש על ההבנה.");
has("the signature", authorized, "בברכה,\nעידן\nBuy Today");
expect("the subject names the order", cancellationMessage(order("AUTHORIZED")).subject, "ביטול הזמנה PR-996964");

/* First name only — "שלום ששון כהן," reads like a letter from a bank. */
has("the surname is left off", authorized, "שלום ששון כהן", false);
has("a one-word name still works", cancellationMessage({ orderNumber: "PR-1", customerName: "ששון", paymentStatus: null }).body, "שלום ששון,");
has(
  "a missing name does not greet an empty space",
  cancellationMessage({ orderNumber: "PR-1", customerName: "", paymentStatus: null }).body,
  "שלום לקוח יקר,",
);
has(
  "nor does a name that is only spaces",
  cancellationMessage({ orderNumber: "PR-1", customerName: "   ", paymentStatus: null }).body,
  "שלום לקוח יקר,",
);

/* Another salesperson signs their own name, not his. */
has(
  "whoever sends it signs it",
  cancellationMessage(order("AUTHORIZED"), "נועה").body,
  "בברכה,\nנועה\nBuy Today",
);

console.log(
  `${checked - failed}/${checked} passed  (the owner's wording verbatim; ` +
    `a held card is told the hold is released, a charged one is told about ` +
    `the refund, and neither is ever sent the other's sentence)`,
);
process.exit(failed === 0 ? 0 : 1);
