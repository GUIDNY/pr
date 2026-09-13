/**
 * Query-string values that must never reach an analytics tag.
 *
 * A page view carries the URL, and the URL is not always only a location.
 * The order confirmation offers a guest an account and hands the register
 * page what they already typed — `/register?name=…&email=…&phone=…` — so a
 * real customer's name, address and telephone number rode into Google
 * Analytics inside `page_path` and `page_location`.
 *
 * That is a problem on its own terms: Google's own terms forbid sending
 * personal data to a property, and a shop's analytics is not a place anybody
 * expects to find a customer's phone number. It also made a statement this
 * shop had already put in writing to App Review — that no customer names,
 * addresses or telephone numbers are sent to Google Analytics — untrue.
 *
 * The redaction lives here rather than at the one link that caused it,
 * because the link is not the invariant. Any page may grow a parameter
 * later, and the tag would carry that one too without anybody noticing. The
 * measurement layer is the last point every URL passes through.
 *
 * A denylist and not an allowlist, deliberately: dropping every unfamiliar
 * parameter would silently blind the analytics that is the only reason the
 * tag is installed — search terms, filters, campaign attribution. What is
 * listed is what a person types about themselves.
 */
const SENSITIVE = new Set([
  "name",
  "email",
  "mail",
  "phone",
  "tel",
  "address",
  "password",
  "token",
  "otp",
  "code",
]);

const PLACEHOLDER = "redacted";

/** Placeholder origin: only ever used to parse a path, never emitted. */
const RELATIVE_BASE = "https://redacted.invalid";

/**
 * The same URL with any sensitive parameter's value replaced.
 *
 * Takes an absolute URL or a path, and returns the shape it was given —
 * `page_location` wants the whole href, `page_path` wants the path. An input
 * that will not parse comes back untouched rather than throwing inside an
 * effect whose failure nobody would see.
 */
export function redactSensitiveParams(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url, RELATIVE_BASE);
  } catch {
    return url;
  }

  let redacted = false;
  for (const key of Array.from(parsed.searchParams.keys())) {
    if (SENSITIVE.has(key.toLowerCase())) {
      parsed.searchParams.set(key, PLACEHOLDER);
      redacted = true;
    }
  }
  if (!redacted) return url;

  const wasAbsolute = parsed.origin !== RELATIVE_BASE || /^[a-z][a-z0-9+.-]*:/i.test(url);
  return wasAbsolute ? parsed.toString() : `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
