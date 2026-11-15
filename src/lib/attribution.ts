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
  /* The ad click ids, exactly as they arrived, so a sale can be reported
     back to the network that paid for the click even if every browser-side
     tag failed — Google's offline conversion import is keyed on these. Kept
     per touch, so `last` carries the click that preceded the order.
       gclid   Google Ads, the ordinary click
       gbraid  Google Ads, app / iOS measurement
       wbraid  Google Ads, web without third-party cookies
       srsltid Google's free Shopping listings (the Merchant Center feed) */
  gclid: z.string().max(300).optional(),
  gbraid: z.string().max(300).optional(),
  wbraid: z.string().max(300).optional(),
  srsltid: z.string().max(300).optional(),
});

/* The most recent Google Ads click, kept apart from the two touches.
   `last` is replaced by every later arrival from somewhere real, and a later
   arrival is usually not an ad: someone clicks an ad, leaves, and comes back
   two days later by searching for the shop's name. That return visit became
   `last`, the ad click's ids went with the touch it replaced, and unless the
   ad click happened to be the very first visit the sale had no click id left
   to be reported against. This keeps them. Ids only — what the click was is
   still told by the touches. */
const adClickSchema = z.object({
  gclid: z.string().max(300).optional(),
  gbraid: z.string().max(300).optional(),
  wbraid: z.string().max(300).optional(),
  /** ISO time of the click. */
  at: z.string().max(40),
});

export const attributionSchema = z.object({
  first: touchSchema,
  last: touchSchema.optional(),
  click: adClickSchema.optional(),
});

export type AttributionTouch = z.infer<typeof touchSchema>;
export type Attribution = z.infer<typeof attributionSchema>;
type KeptAdClick = z.infer<typeof adClickSchema>;

/** The ad click ids a touch arrived with, or undefined when it had none. */
function adClickFromTouch(t: AttributionTouch | undefined): KeptAdClick | undefined {
  if (!t || !(t.gclid || t.gbraid || t.wbraid)) return undefined;
  return {
    ...(t.gclid ? { gclid: t.gclid } : {}),
    ...(t.gbraid ? { gbraid: t.gbraid } : {}),
    ...(t.wbraid ? { wbraid: t.wbraid } : {}),
    at: t.at,
  };
}

/**
 * What the cookie should hold after this page load, or null to leave it as
 * it is. The rule the browser applies (components/analytics/
 * attribution-capture.tsx), written here so it can be tested without one.
 *
 * - no cookie yet: this touch is `first`.
 * - a direct visit never replaces anything: typing the address after a
 *   campaign click is still the campaign's sale.
 * - anything else becomes `last`, and the most recent ad click is carried
 *   in `click`: this touch's own ids if it has any, else the ones already
 *   kept, else the ones on the touch being replaced.
 */
export function nextAttribution(existing: Attribution | null, touch: AttributionTouch): Attribution | null {
  if (!existing) return { first: touch };
  if (touch.source === "direct") return null;
  const click = adClickFromTouch(touch) ?? existing.click ?? adClickFromTouch(existing.last);
  return { first: existing.first, last: touch, ...(click ? { click } : {}) };
}

/* Google accepts a click conversion for a click up to 90 days old. The
   cookie's own life is renewed by every write, so a kept click can outlive
   that, and an upload against it would be refused eight times and leave an
   error on an order that has nothing wrong with it. */
const AD_CLICK_MAX_AGE_MS = 90 * 86_400_000;

/** The kept ad click, unless it is too old for Google to take. */
function freshClick(a: Attribution | null | undefined, now = Date.now()): KeptAdClick | undefined {
  const click = a?.click;
  if (!click) return undefined;
  const at = Date.parse(click.at);
  if (Number.isFinite(at) && now - at > AD_CLICK_MAX_AGE_MS) return undefined;
  return click;
}

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
  shopping: "שופינג (מודעה חינמית)",
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

/** The Google Ads click id to credit a sale to: the most recent touch's,
    else the most recent ad click's (kept apart, see adClickSchema), else
    the first touch's. Google matches a click conversion on this alone, so
    it is kept in its own column on the cart and the order. */
export function gclidOf(a: Attribution | null | undefined, now = Date.now()): string | null {
  return a?.last?.gclid ?? freshClick(a, now)?.gclid ?? a?.first.gclid ?? null;
}

/** One Google Ads click, by exactly one of its ids — which is how Google
    takes a click conversion: a gclid, or a gbraid, or a wbraid. */
export type AdClick = { gclid: string } | { gbraid: string } | { wbraid: string };

/**
 * The click a sale is reported against.
 *
 * `gclid` — the order's own column — wins when it is set, so nothing that
 * was reported before is reported differently. When it is empty the
 * attribution is asked for the other two ids, the most recent touch first.
 *
 * Those two are not an edge case. An ad click from an iPhone often arrives
 * with a gbraid or a wbraid and no gclid at all, and until 15 November such
 * an order had nothing in its gclid column and was never reported: of the
 * five carts that came from a paid click between 10 and 14 November, two
 * were exactly that. The ids were already kept on the touch (see the schema
 * above), so no column is needed to read them back.
 */
export function adClickOf(gclid: string | null | undefined, attribution: unknown, now = Date.now()): AdClick | null {
  if (gclid) return { gclid };
  const a = attributionFromJson(attribution);
  for (const touch of [a?.last, freshClick(a, now), a?.first]) {
    if (touch?.gclid) return { gclid: touch.gclid };
    if (touch?.gbraid) return { gbraid: touch.gbraid };
    if (touch?.wbraid) return { wbraid: touch.wbraid };
  }
  return null;
}
