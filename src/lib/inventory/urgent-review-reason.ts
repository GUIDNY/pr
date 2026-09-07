import "server-only";

/**
 * The reason a product is sitting in "טיפול דחוף", read off its alert.
 *
 * Every product on that list carries a written finding — which kind of
 * problem it is, what was actually found, what it puts at risk and what has
 * to be decided — and none of it was on screen. The list showed a name, a
 * brand and a stock number, so the only way to learn why a product was there
 * was to have been the one who put it there.
 *
 * InventoryAlert.metadata is a text column holding JSON, so it is parsed
 * defensively and never trusted to have a shape. Alerts raised from the
 * button on a product page carry no metadata at all, and those fall back to
 * the alert's own message: a product never appears on this list without a
 * reason next to it, whichever way it got there.
 */
export type UrgentReviewReason = {
  kind: string | null;
  label: string;
  why: string;
  risk: string | null;
  action: string | null;
};

const FALLBACK_LABEL = "סומן ידנית";

export function parseUrgentReviewReason(
  metadata: string | null,
  message: string,
): UrgentReviewReason {
  const fallback: UrgentReviewReason = {
    kind: null,
    label: FALLBACK_LABEL,
    why: message,
    risk: null,
    action: null,
  };

  if (!metadata) return fallback;

  try {
    const parsed: unknown = JSON.parse(metadata);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fallback;
    const raw = parsed as Record<string, unknown>;

    const text = (value: unknown): string | null => {
      if (typeof value !== "string") return null;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    };

    // `why` is the finding itself. Without one there is nothing to read, so
    // the alert's own message stands in rather than an empty card.
    const why = text(raw.why) ?? message;

    return {
      kind: text(raw.kind),
      label: text(raw.label) ?? FALLBACK_LABEL,
      why,
      risk: text(raw.risk),
      action: text(raw.action),
    };
  } catch {
    // Malformed JSON in a text column is exactly what a text column allows.
    return fallback;
  }
}

/**
 * How loudly a kind should read.
 *
 * The split is by what the finding costs, not by how interesting it is: the
 * first group is money — a wrong price, stock that cannot be sold, a row
 * attached to the wrong sheet line — and it is the group worth clearing
 * first. The middle group is a customer seeing something untrue about a
 * product. The rest are catalogue hygiene.
 */
export type ReasonTone = "destructive" | "warning" | "muted";

const COSTS_MONEY = new Set([
  "price-decision",
  "price-error",
  "phantom-stock",
  "unidentified-row",
  "sheet-row-mismatch",
]);

const MISLEADS_A_CUSTOMER = new Set(["brand-clash", "wrong-product-spec"]);

export function toneForKind(kind: string | null): ReasonTone {
  if (kind && COSTS_MONEY.has(kind)) return "destructive";
  if (kind && MISLEADS_A_CUSTOMER.has(kind)) return "warning";
  return "muted";
}
