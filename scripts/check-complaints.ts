// The complaint ingest endpoint's own rules, held to the cases the spec
// names plus the ones that would embarrass us.
//
// The pure half runs anywhere:
//   npm run check:complaints
// The endpoint half needs a server and a database, and is what actually
// proves the flow:
//   COMPLAINTS_BASE=http://localhost:3900 INTERNAL_API_KEY=... npm run check:complaints
import { redactSensitive, passesLuhn, isIsraeliId } from "../src/lib/complaints/redact";
import { deriveSeverity, raiseSeverity, deriveCategory, deriveSubject } from "../src/lib/complaints/severity";
import { COMPLAINT_OPENING_INTENTS, BOT_INTENTS } from "../src/lib/enums";

let failed = 0;
let passed = 0;
const fail = (msg: string) => { console.log(`FAIL  ${msg}`); failed++; };
const ok = () => passed++;
const eq = <T,>(got: T, want: T, why: string) =>
  JSON.stringify(got) === JSON.stringify(want) ? ok() : fail(`${why}\n        got ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);

// --- redaction: the numbers that must go ---------------------------------
// 4580458045804580 and 4111111111111111 are the networks' own published test
// numbers, so they are real card numbers by every check that matters and
// belong to nobody.
if (!passesLuhn("4111111111111111")) fail("a valid card number must pass Luhn"); else ok();
if (passesLuhn("4111111111111112")) fail("one digit off must not pass Luhn"); else ok();
if (!isIsraeliId("123456782")) fail("a valid Israeli id must pass its check digit"); else ok();
if (isIsraeliId("123456789")) fail("nine arbitrary digits must not"); else ok();

const card = redactSensitive("הכרטיס שלי 4111 1111 1111 1111 ותודה");
eq(card.redacted, ["credit_card"], "a card number is recognised through its spaces");
if (card.text.includes("4111")) fail("no fragment of the card number may survive"); else ok();
if (!card.text.includes("[הוסתר: כרטיס אשראי]")) fail("the gap is labelled so the thread still reads"); else ok();

const id = redactSensitive("ת.ז 123456782 בבקשה");
eq(id.redacted, ["israeli_id"], "an identity number is recognised by its check digit");

const cvv = redactSensitive("cvv 123");
eq(cvv.redacted, ["cvv"], "a CVV is removed when something next to it says what it is");

// --- redaction: the numbers that must stay -------------------------------
// This is the half that decides whether the feature stays usable. A guard
// that eats order numbers and prices makes every thread unreadable.
const KEEP: [string, string][] = [
  ["הזמנה מספר 100234 לא הגיעה", "an order number"],
  ["המקרר עלה 4590 שקל", "a price"],
  ["הדגם הוא RT62K7044BS 635 ליטר", "a model and a capacity"],
  ["תתקשרו אלי 050-1234567", "a phone number"],
  ["הזמנתי ב 12/08/2026 וזה לא הגיע", "a date"],
  ["צריך 3 מטר כבל", "a measurement"],
];
for (const [text, why] of KEEP) {
  const r = redactSensitive(text);
  if (r.redacted.length > 0) fail(`${why} must not be redacted: ${JSON.stringify(text)} -> ${JSON.stringify(r.text)}`);
  else if (r.text !== text) fail(`${why} must come back untouched`);
  else ok();
}

// --- severity ------------------------------------------------------------
const SEV: [string, number, string, string][] = [
  ["אני הולך לעורך דין", 1, "CRITICAL", "a lawyer"],
  ["אני מתלונן להגנת הצרכן", 1, "CRITICAL", "the consumer authority"],
  ["אני אפרסם את זה בפייסבוק", 1, "CRITICAL", "a threat to publish"],
  ["המקרר הציף לי את הדירה", 1, "CRITICAL", "damage to property"],
  ["הבן שלי נפגע מזה", 1, "CRITICAL", "injury"],
  ["זו חוצפה, נמאס לי", 1, "HIGH", "anger stated outright"],
  ["זה הפעם ה-3 שאני כותב", 1, "HIGH", "a third attempt named by the customer"],
  ["התנור לא עובד", 3, "HIGH", "a third message on a thread nobody closed"],
  ["התנור לא עובד", 1, "MEDIUM", "the same words, first time"],
  ["רציתי לדעת מתי אתם פתוחים", 1, "LOW", "a question is not a grievance"],
];
for (const [text, count, want, why] of SEV) {
  eq(deriveSeverity({ text, customerMessageCount: count }), want, `${why}: ${JSON.stringify(text)}`);
}
eq(raiseSeverity("HIGH", "LOW"), "HIGH", "a complaint never becomes less severe on its own");
eq(raiseSeverity("MEDIUM", "CRITICAL"), "CRITICAL", "but it does become more severe");

// --- category ------------------------------------------------------------
eq(deriveCategory("המשלוח לא הגיע כבר שבועיים"), "DELIVERY_DELAY", "a late delivery");
eq(deriveCategory("המקרר הגיע שבור"), "DELIVERY_DAMAGE", "damage beats a plain defect");
eq(deriveCategory("אני רוצה לבטל את ההזמנה ולקבל זיכוי"), "RETURN_REFUND", "a refund");
eq(deriveCategory("חויבתי פעמיים בכרטיס"), "BILLING", "a double charge");
eq(deriveCategory("שלום מה שלומכם"), "OTHER", "nothing recognisable is OTHER, not a guess");

// --- subject -------------------------------------------------------------
if (deriveSubject("a".repeat(300)).length > 121) fail("the subject stays within 120 characters"); else ok();
eq(deriveSubject("   "), "פנייה ללא טקסט", "an empty message still gets a readable subject");
eq(deriveSubject("הזמנתי מקרר"), "הזמנתי מקרר", "a short message is used as it is");

// --- the opening gate ----------------------------------------------------
for (const intent of ["complaint", "human_request"] as const) {
  if (!COMPLAINT_OPENING_INTENTS.includes(intent)) fail(`${intent} must be able to open a complaint`); else ok();
}
// Everything else, and specifically the three that were on this list in the
// first draft: they are questions, and a queue full of questions is the
// failure this feature exists to fix.
for (const intent of ["order_status", "returns", "warranty", "greeting", "product_question", "price_question", "shipping", "payment", "technical_support", "off_topic", "other"] as const) {
  if (COMPLAINT_OPENING_INTENTS.includes(intent)) fail(`${intent} must not open a complaint on its own`); else ok();
}
if (COMPLAINT_OPENING_INTENTS.length !== 2) fail(`exactly two intents may open a complaint, found ${COMPLAINT_OPENING_INTENTS.length}`); else ok();
for (const intent of COMPLAINT_OPENING_INTENTS) {
  if (!BOT_INTENTS.includes(intent)) fail(`"${intent}" is not one of the intents the bot can return`); else ok();
}

console.log(`${passed}/${passed + failed} pure checks passed`);

// --- the endpoint, when there is one to talk to --------------------------
const BASE = process.env.COMPLAINTS_BASE;
const KEY = process.env.INTERNAL_API_KEY;

async function liveChecks() {
  if (!BASE || !KEY) {
    console.log("\n(no COMPLAINTS_BASE / INTERNAL_API_KEY — endpoint checks skipped)");
    return;
  }
  const url = `${BASE}/api/internal/complaints/ingest`;
  const post = async (body: unknown, key = KEY) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-key": key ?? "" },
      body: JSON.stringify(body),
    });
    return { status: res.status, json: res.status === 200 ? await res.json() : null };
  };

  const waId = `97250${Date.now().toString().slice(-7)}`;
  const stamp = Date.now();

  const noKey = await post({ waId }, "not-the-key");
  if (noKey.status !== 401) fail(`a wrong key must be 401, got ${noKey.status}`); else ok();

  const greeting = await post({ waId, waMessageId: `g-${stamp}`, customerText: "היי", intent: "greeting", needsHuman: false });
  eq([greeting.json?.created, greeting.json?.appended], [false, false], "a greeting with no needsHuman opens nothing");

  // The three that came off the opening list: a question, on its own, opens
  // nothing. With needsHuman it does — which is the case where the customer
  // said yes to the bot's offer.
  const question = await post({ waId, waMessageId: `q-${stamp}`, customerText: "מתי ההזמנה שלי מגיעה?", intent: "order_status", needsHuman: false });
  eq([question.json?.created, question.json?.appended], [false, false], "order_status alone no longer opens a complaint");

  const first = await post({
    waId, customerName: "בדיקה", waMessageId: `a-${stamp}`,
    customerText: "הזמנתי מקרר לפני שבועיים והוא עדיין לא הגיע. הכרטיס שלי 4111 1111 1111 1111",
    botReply: "אני מעביר אותך לנציג", intent: "complaint", needsHuman: true,
  });
  if (!first.json?.created) fail("the first complaining message opens a complaint"); else ok();
  if (typeof first.json?.ticketNumber !== "number") fail("a complaint comes back with a ticket number"); else ok();

  const retry = await post({ waId, waMessageId: `a-${stamp}`, customerText: "…", intent: "complaint", needsHuman: true });
  eq([retry.json?.created, retry.json?.appended], [false, false], "the same waMessageId a second time writes nothing");
  eq(retry.json?.complaintId, first.json?.complaintId, "and still reports which complaint it belongs to");

  const second = await post({ waId, waMessageId: `b-${stamp}`, customerText: "תודה", intent: "greeting", needsHuman: false });
  if (!second.json?.appended) fail("a later message joins the open complaint whatever its intent"); else ok();
  eq(second.json?.complaintId, first.json?.complaintId, "and joins that same one");

  const angry = await post({ waId, waMessageId: `c-${stamp}`, customerText: "אני פונה לעורך דין", intent: "complaint", needsHuman: true });
  eq(angry.json?.severity, "CRITICAL", "a lawyer raises the complaint to CRITICAL");

  console.log(`\nendpoint: complaint #${first.json?.ticketNumber} at ${first.json?.complaintId}`);
  console.log("(the response carries ids and flags only — no message text — so a caller that logs it leaks nothing)");
}

liveChecks()
  .catch((err) => {
    console.error(err);
    failed++;
  })
  .finally(() => {
    console.log(`\n${passed}/${passed + failed} checks passed`);
    process.exitCode = failed > 0 ? 1 : 0;
  });
