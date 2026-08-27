// Checkout only ever validated on submit, on the server, through the Zod
// schema — so a customer learned their phone number was too short after
// filling in the whole form and pressing the button, as one toast with no
// indication of which field it meant. These run as each field is left, so a
// mistake is caught where it was made.
//
// None of this replaces the server-side schema, which stays the authority: a
// browser check is a courtesy to the person typing, not a guarantee about
// what arrives.

// Israeli numbers are typed every way there is: 050-123-4567, 0501234567,
// +972 50 123 4567, 972501234567. Reduce to digits and fold the country code
// back to a leading zero — the same normalisation order tracking already does
// (see lib/queries/orders.ts), so a number accepted here is one the customer
// can later look their order up with.
export function normaliseIsraeliPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("972") ? `0${digits.slice(3)}` : digits;
}

export function validatePhone(value: string): string | null {
  const digits = normaliseIsraeliPhone(value);
  if (!digits) return "יש להזין מספר טלפון";
  if (!digits.startsWith("0")) return "מספר טלפון ישראלי מתחיל ב-0 (או +972)";
  // Mobile is 10 digits (05X + 7), landline 9 (0X + 7).
  if (digits.length !== 9 && digits.length !== 10) return "מספר טלפון לא תקין";
  return null;
}

export function validateEmail(value: string): string | null {
  if (!value.trim()) return "יש להזין כתובת אימייל";
  // Deliberately loose. The only test that settles whether an address exists
  // is sending to it, and a stricter pattern's real-world effect is rejecting
  // valid addresses (plus-tags, new TLDs, non-ASCII local parts).
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim())) return "כתובת אימייל לא תקינה";
  return null;
}

export function validateFullName(value: string): string | null {
  return value.trim().length >= 2 ? null : "יש להזין שם מלא";
}

// Groups digits 4-4-4-4 as they're typed. A 16-digit run with no spacing is
// unreadable and impossible to proofread against the card in your hand.
export function formatCardNumber(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 19);
  return digits.replace(/(.{4})/g, "$1 ").trim();
}

// Luhn. Every real card number satisfies it, so it catches the single
// mistyped or transposed digit that is the overwhelmingly common error —
// before the customer submits and waits for a decline.
export function passesLuhn(cardNumber: string): boolean {
  const digits = cardNumber.replace(/\D/g, "");
  if (digits.length < 12) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

export function validateCardNumber(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "יש להזין מספר כרטיס";
  if (digits.length < 12) return "מספר כרטיס קצר מדי";
  if (!passesLuhn(digits)) return "מספר הכרטיס אינו תקין — בדקו שאין ספרה שגויה";
  return null;
}

// Inserts the slash so "1228" becomes "12/28" without the customer typing it.
export function formatCardExpiry(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

export function validateCardExpiry(value: string, now = new Date()): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 4) return "תוקף בפורמט MM/YY";
  const month = Number(digits.slice(0, 2));
  const year = 2000 + Number(digits.slice(2));
  if (month < 1 || month > 12) return "חודש לא תקין";
  // A card is valid through the last day of its expiry month.
  const expiresAfter = new Date(year, month, 1);
  if (expiresAfter <= now) return "הכרטיס פג תוקף";
  return null;
}

export function validateCardCvv(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 3 || digits.length > 4) return "CVV הוא 3 או 4 ספרות";
  return null;
}

// Suggestions for the city field, not a closed list — the input stays free
// text and anywhere in the country can still be typed. A misspelled city is
// a delivery that goes to the wrong depot, and offering the common spelling
// is most of the fix.
export const ISRAELI_CITY_SUGGESTIONS = [
  "אילת", "אור יהודה", "אשדוד", "אשקלון", "באר שבע", "בית שאן", "בית שמש", "ביתר עילית",
  "בני ברק", "בת ים", "גבעת שמואל", "גבעתיים", "דימונה", "הוד השרון", "הרצליה", "זכרון יעקב",
  "חדרה", "חולון", "חיפה", "טבריה", "טירת כרמל", "יבנה", "יהוד-מונוסון", "ירושלים",
  "כפר סבא", "כרמיאל", "לוד", "מודיעין-מכבים-רעות", "מעלה אדומים", "מעלות-תרשיחא", "נהריה",
  "נס ציונה", "נצרת", "נשר", "נתיבות", "נתניה", "עכו", "עפולה", "ערד", "פתח תקווה",
  "צפת", "קריית אונו", "קריית ביאליק", "קריית גת", "קריית ים", "קריית מוצקין", "קריית שמונה",
  "ראש העין", "ראשון לציון", "רחובות", "רמלה", "רמת גן", "רמת השרון", "רעננה", "שדרות",
  "תל אביב-יפו",
];
