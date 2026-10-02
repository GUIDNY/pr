import { z } from "zod";

/**
 * Where a visitor came from, kept with the cart and the order.
 *
 * The browser writes it (components/analytics/attribution-capture.tsx): on
 * the first page of a visit it reads the referrer and the address's utm,
 * gclid and fbclid parameters, classifies them, and keeps the answer in a
 * cookie. The server reads the cookie when a cart is created and when an
 * order is placed, and the order page in the back office shows it.
 *
 * Two touches are kept. `first` is the visit that brought the person to the
 * shop and never changes while the cookie lives. `last` is the most recent
 * arrival from somewhere else — the campaign click that preceded the order —
 * and is what an ad report wants. A visitor who came once from Google and
 * then typed the address has first = google, last = google: typing the
 * address is not a source.
 *
 * Nothing here identifies the person. It is the same information Google
 * Analytics already receives, kept where the order is so the shop can read
 * it without opening another tool.
 */

export const ATTRIBUTION_COOKIE = "bt_attr";
export const ATTRIBUTION_COOKIE_DAYS = 90;

const touchSchema = z.object({
  /** google, facebook, instagram, whatsapp, direct, a referrer host, or utm_source. */
  source: z.string().max(80),
  /** organic, cpc, paid-social, social, referral, (none), or utm_medium. */
  medium: z.string().max(80),
  campaign: z.string().max(120).optional(),
  content: z.string().max(120).optional(),
  term: z.string().max(120).optional(),
  /** The referring host, when there was one. */
  referrer: z.string().max(200).optional(),
  /** The first page of the visit, path and query. */
  landing: z.string().max(300).optional(),
  /** ISO time of the touch. */
  at: z.string().max(40),
});

export const attributionSchema = z.object({
  first: touchSchema,
  last: touchSchema.optional(),
});

export type AttributionTouch = z.infer<typeof touchSchema>;
export type Attribution = z.infer<typeof attributionSchema>;

/** The cookie as the browser wrote it, or null for anything else. Never
    throws: a malformed cookie is not a reason to lose an order. */
export function parseAttribution(raw: string | null | undefined): Attribution | null {
  if (!raw) return null;
  try {
    const parsed = attributionSchema.safeParse(JSON.parse(decodeURIComponent(raw)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** A stored JSON column, checked against the same shape. */
export function attributionFromJson(value: unknown): Attribution | null {
  const parsed = attributionSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

const SOURCE_LABELS: Record<string, string> = {
  direct: "כניסה ישירה",
  google: "גוגל",
  bing: "בינג",
  facebook: "פייסבוק",
  instagram: "אינסטגרם",
  whatsapp: "וואטסאפ",
  tiktok: "טיקטוק",
  youtube: "יוטיוב",
  twitter: "X (טוויטר)",
  telegram: "טלגרם",
  zap: "זאפ",
  mall: "הקניון התלת־ממדי",
  buytoday: "האתר עצמו",
};

const MEDIUM_LABELS: Record<string, string> = {
  "(none)": "",
  organic: "חיפוש אורגני",
  cpc: "פרסום ממומן",
  "paid-social": "פרסום ממומן",
  social: "רשת חברתית",
  referral: "קישור",
  email: "מייל",
  sms: "SMS",
  home: "דף הבית",
  footer: "פוטר",
  header: "כותרת",
};

/** One touch in the shop's words: "גוגל · חיפוש אורגני" or "פייסבוק · קמפיין חורף". */
export function describeTouch(t: AttributionTouch): string {
  const source = SOURCE_LABELS[t.source] ?? t.source;
  const medium = MEDIUM_LABELS[t.medium] ?? t.medium;
  const parts = [source];
  if (medium) parts.push(medium);
  if (t.campaign) parts.push(`קמפיין ${t.campaign}`);
  return parts.join(" · ");
}
