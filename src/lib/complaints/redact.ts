// Removing card numbers and identity numbers from a complaint before it is
// stored.
//
// A customer being talked through a failed payment types their card number
// into WhatsApp. It is already in Meta's hands by then and there is nothing
// to do about that; what this decides is whether it also ends up in our
// database, in a table staff read all day and a backup nobody thinks about.
//
// So the raw value is not kept anywhere — not in a second column, not in a
// log line, not in the return value. What survives is the fact that
// something was removed, which is what a person reading the thread needs in
// order to understand the gap.
//
// Both tests are checksums rather than "a run of digits", because a run of
// digits is also an order number, a phone number, a model number and a
// price. A guard that eats those makes the thread unreadable, and an
// unreadable thread is how the whole feature stops being used.

export type RedactionResult = { text: string; redacted: string[] };

export const REDACTION_LABELS: Record<string, string> = {
  credit_card: "[הוסתר: כרטיס אשראי]",
  cvv: "[הוסתר: CVV]",
  israeli_id: "[הוסתר: תעודת זהות]",
};

// Luhn, the check the card networks themselves use. A 13-to-19 digit run
// that passes it is a card number with a probability high enough to act on;
// one that fails is a long number that happens to be long.
export function passesLuhn(digits: string): boolean {
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

// The Israeli identity number's own check digit — the same weighted sum the
// Interior Ministry uses. Nine digits that fail it are not an identity
// number, and nine digits turn up in this catalog constantly (a price, a
// phone number without its dashes, an EAN fragment).
export function isIsraeliId(digits: string): boolean {
  if (!/^\d{9}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let d = (digits.charCodeAt(i) - 48) * ((i % 2) + 1);
    if (d > 9) d -= 9;
    sum += d;
  }
  return sum % 10 === 0;
}

// Digits as people actually type them: 4580 1234 5678 9012, 4580-1234-…,
// or one unbroken run. The separators are kept in the match so the whole
// thing is replaced rather than leaving orphaned dashes behind.
const DIGIT_RUN = /\d(?:[\d \-.]{7,26})\d/g;
// "cvv 123", "קוד אבטחה 456" — a three or four digit number is far too
// common to remove on sight, so it is only removed when something next to it
// says what it is.
const CVV_NEAR = /(?:\bcvv\b|\bcvc\b|קוד\s*אבטחה|3\s*ספרות\s*(?:בגב|מאחור))\D{0,12}(\d{3,4})/gi;

export function redactSensitive(input: string): RedactionResult {
  const redacted = new Set<string>();
  let text = input;

  text = text.replace(CVV_NEAR, (match, code: string) => {
    redacted.add("cvv");
    return match.replace(code, REDACTION_LABELS.cvv);
  });

  text = text.replace(DIGIT_RUN, (match) => {
    const digits = match.replace(/\D/g, "");
    if (passesLuhn(digits)) {
      redacted.add("credit_card");
      return REDACTION_LABELS.credit_card;
    }
    if (isIsraeliId(digits)) {
      redacted.add("israeli_id");
      return REDACTION_LABELS.israeli_id;
    }
    return match;
  });

  return { text, redacted: [...redacted] };
}
