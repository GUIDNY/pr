/**
 * The actions a visit can report, beside the pages it saw.
 *
 * PageView says where a session went; this says what it did there — and
 * only from a closed list, with a closed list of keys per event, so that a
 * caller cannot widen what is kept by passing more. Same privacy terms as
 * the page log: the visit id that lapses within a day, a path with no
 * query, never an IP or an agent string, never a name, email, phone or
 * address, not even inside meta. The join to an order is Order.visitSid.
 *
 * No imports: used by the proxy-side helper, the route and the checks.
 */
export const VISIT_EVENT_TYPES = [
  "add_to_cart_click",
  "add_to_cart_result",
  "add_to_cart_blocked",
  "cart_open",
  "checkout_start",
  "payment_submit",
  "payment_result",
  "checkout_abandon",
  // a lead: a tap on the number or on WhatsApp, or a form that went through
  "contact_click",
  "form_submit",
] as const;
export type VisitEventType = (typeof VISIT_EVENT_TYPES)[number];

/** What each event may carry, and the shape of each value. Anything else
    in the body is dropped, silently. */
const META_KEYS: Record<VisitEventType, Record<string, "string" | "number" | "boolean">> = {
  add_to_cart_click: { productSlug: "string", price: "number" },
  add_to_cart_result: { productSlug: "string", ok: "boolean" },
  add_to_cart_blocked: { productSlug: "string", blockedBy: "string" },
  cart_open: { itemCount: "number", total: "number" },
  checkout_start: { itemCount: "number", total: "number" },
  payment_submit: { orderNumber: "string", total: "number" },
  payment_result: { orderNumber: "string", statusCode: "string" },
  checkout_abandon: { itemCount: "number", total: "number", secondsOnPage: "number" },
  contact_click: { channel: "string", target: "string" },
  form_submit: { form: "string", channel: "string" },
};

const MAX_STRING = 120;

export function isVisitEventType(type: unknown): type is VisitEventType {
  return typeof type === "string" && (VISIT_EVENT_TYPES as readonly string[]).includes(type);
}

/** The allowed keys of `meta` for this type, each checked for shape and
    length; null when nothing survives. */
export function sanitizeEventMeta(type: VisitEventType, meta: unknown): Record<string, string | number | boolean> | null {
  if (!meta || typeof meta !== "object") return null;
  const out: Record<string, string | number | boolean> = {};
  for (const [key, shape] of Object.entries(META_KEYS[type])) {
    const value = (meta as Record<string, unknown>)[key];
    if (shape === "string" && typeof value === "string" && value.trim()) out[key] = value.trim().slice(0, MAX_STRING);
    else if (shape === "number" && typeof value === "number" && Number.isFinite(value)) out[key] = Math.round(value * 100) / 100;
    else if (shape === "boolean" && typeof value === "boolean") out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}
