import { COMPLAINT_SEVERITY_RANK, type ComplaintSeverity, type ComplaintCategory } from "@/lib/enums";

// How urgent a complaint is, from the customer's own words.
//
// Rules rather than a model call, for one reason that matters more than
// accuracy: this runs while the ingest request is open, and the ingest
// request runs after the customer already has their answer. A rule table
// costs microseconds and cannot fail; an LLM call costs seconds, can time
// out, and would push the severity behind a network hop for no gain a person
// reading the thread could not make themselves.
//
// Every phrase below is one a person would escalate on if they read it, and
// the escalating ones are checked first. A complaint never becomes less
// severe on its own — see raiseSeverity.

// Someone talking about a lawyer, the consumer protection authority, a
// review campaign, or an injury. Whatever else is true, this one is read
// today.
const CRITICAL = [
  /עורך[- ]?דין|עו"?ד\b|תבוע|תביעה|לתבוע|בית משפט|בבית המשפט/,
  /הגנת הצרכן|המועצה לצרכנות|רשות הצרכנות|תלונה למשרד|תלונה לרשות/,
  /ביקורת (?:רעה|שלילית)|לפרסם|אפרסם|פייסבוק|רשתות חברתיות|לעשות פוסט|כתבה/,
  /נפגע(?:תי|ה)?|פציע|נכווי|כווי|שרפה|שריפ|התחשמל|חשמל(?:י)?\s*מכה|סכנה|מסוכן/,
  /הצפה|הציף|נזק לדירה|הרס(?:ה)? לי|נזק לרכוש|הרסתם/,
];

// Anger stated outright. Not an insult filter — the point is that someone
// who writes this has stopped being patient, and a queue sorted by severity
// should put them above a calm question.
const HIGH = [
  /מגעיל|מזעזע|שערורי|בושה|חוצפה|לא ייאמן|לא יאומן|זלזול|מזלזל/,
  /זה הפעם ה[־-]?\d|שוב פעם|כבר \d+ פעמים|פעם שלישית|פעם רביעית/,
  /נמאס לי|איבדתי סבלנות|די כבר|עד מתי|כמה זמן עוד/,
  /רמאים|רמית|הונאה|גנב|גנבתם|שקר|שיקרתם/,
];

// A grievance stated plainly. The default for anything that opened a
// complaint at all.
const MEDIUM = [
  /לא עובד|התקלק|תקול|פגום|שבור|נשבר|לא הגיע|מתעכב|עיכוב|חסר|לא קיבלתי/,
  /להחזיר|החזר|זיכוי|ביטול|לבטל/,
];

export type SeverityInput = {
  text: string;
  /** How many CUSTOMER messages the thread will hold after this one. */
  customerMessageCount: number;
};

export function deriveSeverity({ text, customerMessageCount }: SeverityInput): ComplaintSeverity {
  const t = text.replace(/\s+/g, " ");
  if (CRITICAL.some((r) => r.test(t))) return "CRITICAL";
  if (HIGH.some((r) => r.test(t))) return "HIGH";
  // A third message on a complaint still open means two answers did not
  // land. That is a fact about the thread, not about the wording, and it is
  // exactly the case a calm customer's patience runs out on unnoticed.
  if (customerMessageCount >= 3) return "HIGH";
  if (MEDIUM.some((r) => r.test(t))) return "MEDIUM";
  return "LOW";
}

/** Never downgrades: a complaint does not become less serious by itself. */
export function raiseSeverity(current: ComplaintSeverity, next: ComplaintSeverity): ComplaintSeverity {
  return COMPLAINT_SEVERITY_RANK[next] > COMPLAINT_SEVERITY_RANK[current] ? next : current;
}

// What the complaint is about, for the category filter. Same reasoning as
// severity: cheap, legible, and wrong in a way anyone can correct from the
// admin in one click. OTHER is a perfectly good answer.
const CATEGORY_RULES: [ComplaintCategory, RegExp][] = [
  ["DELIVERY_DAMAGE", /הגיע (?:שבור|פגום|סדוק)|נזק במשלוח|שבור באריזה|האריזה קרועה/],
  ["DELIVERY_DELAY", /לא הגיע|מתי יגיע|עיכוב|מתעכב|לא נשלח|איפה ההזמנה|מחכה כבר/],
  ["WRONG_ITEM", /מוצר (?:אחר|שגוי|לא נכון)|הזמנתי .* וקיבלתי|לא מה שהזמנתי/],
  ["MISSING_ITEM", /חסר|לא קיבלתי את כל|פריט אחד לא/],
  ["RETURN_REFUND", /להחזיר|החזרה|זיכוי|כסף בחזרה|לבטל את ההזמנה|ביטול עסקה/],
  ["BILLING", /חיוב|חויבתי|כפול בכרטיס|לא זוכיתי|החזר כספי|חשבונית/],
  ["WARRANTY", /אחריות|במעבדה|תיקון|טכנאי|קלקל|התקלק/],
  ["INSTALLATION", /התקנ|להתקין|מתקין|חיבור לקיר|צנרת/],
  ["PRODUCT_DEFECT", /לא עובד|תקול|פגום|רועש|דולף|מפסיק לעבוד/],
  ["SERVICE_QUALITY", /יחס|גס רוח|לא עונים|אף אחד לא חוזר|שירות גרוע/],
];

export function deriveCategory(text: string): ComplaintCategory {
  const t = text.replace(/\s+/g, " ");
  for (const [category, rule] of CATEGORY_RULES) if (rule.test(t)) return category;
  return "OTHER";
}

// The one-line summary shown in the list. The customer's own opening words,
// cut at a word boundary — a generated summary would be another model call
// on the same hot path, and a person scanning the queue is better served by
// what was actually said.
export function deriveSubject(text: string, max = 120): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t || "פנייה ללא טקסט";
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}
