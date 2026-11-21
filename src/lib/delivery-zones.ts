/**
 * Which delivery promise an address gets, by the place it names.
 *
 * lib/delivery.ts states the policy; this answers "and for *this* city?",
 * which only the checkout can ask, because only there has the shopper said
 * where they are. The list of places comes from
 * data/localities.json, written by scripts/update-localities.ts from the
 * state's localities register. Since 21 November 2026 every place gets the
 * same 3–7 business days; the register's old "local" membership is no
 * longer read.
 *
 * No server imports: the checkout form is a client component.
 */
import localities from "@/lib/data/localities.json";
import { DELIVERY_ZONES } from "@/lib/delivery";

export type DeliveryZone = keyof typeof DELIVERY_ZONES;

/** Spellings the same shopper types for the same place: stray quotes and
    geresh marks ("פ"ת", "ג'ת"), hyphens with or without spaces, double
    spaces, a trailing blank, קריית for קרית. The register's own form is the canonical one;
    this is only for matching against it. */
export function normalizeLocality(name: string): string {
  return name
    .replace(/["'״׳`]/g, "")
    /* The register writes קרית with one yod; most people type two. */
    .replace(/קריית/g, "קרית")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export const LOCALITY_NAMES: readonly string[] = localities.names;

/** The places most parcels go, in the register's own spelling. The
    register has no population column, so without this "תל" offers תלם
    and תל שבע before Tel Aviv. Ordering only — a place not on this list
    is still offered, after these. check:delivery verifies every spelling
    here is one the register knows. */
export const MAJOR_LOCALITIES: readonly string[] = [
  "ירושלים", "תל אביב-יפו", "חיפה", "ראשון לציון", "פתח תקווה", "אשדוד", "נתניה", "באר שבע",
  "בני ברק", "חולון", "רמת גן", "אשקלון", "רחובות", "בת ים", "בית שמש", "כפר סבא", "הרצליה",
  "חדרה", "מודיעין-מכבים-רעות", "לוד", "רמלה", "רעננה", "נצרת", "מודיעין עילית", "רהט",
  "הוד השרון", "קרית גת", "גבעתיים", "נהריה", "אילת", "אום אל-פחם", "קרית אתא", "טבריה",
  "עכו", "כרמיאל", "אלעד", "ראש העין", "קרית מוצקין", "עפולה", "יבנה", "קרית ביאליק", "טייבה",
  "ביתר עילית", "קרית ים", "נס ציונה", "דימונה", "קרית אונו", "רמת השרון", "אור יהודה", "שפרעם",
  "זכרון יעקב", "פרדס חנה-כרכור", "בנימינה-גבעת עדה", "אור עקיבא", "קיסריה", "חריש",
  "יקנעם עילית", "טירת כרמל", "נשר", "מגדל העמק", "קרית שמונה", "צפת", "אריאל", "מעלה אדומים",
  "גדרה", "גן יבנה", "שדרות", "אופקים", "נתיבות", "ערד", "מבשרת ציון", "כפר יונה", "אבן יהודה",
  "תל מונד", "קדימה-צורן", "גבעת שמואל", "יהוד-מונוסון", "באקה אל-גרביה", "טמרה", "סח'נין",
];
const MAJOR_RANK = new Map(MAJOR_LOCALITIES.map((n, i) => [n, i] as const));

const KNOWN = new Map(localities.names.map((n) => [normalizeLocality(n), n] as const));

/** The register's spelling of what the shopper typed, or null if it names
    no locality the register knows. */
export function canonicalLocality(name: string): string | null {
  return KNOWN.get(normalizeLocality(name)) ?? null;
}

/** null when the place is not in the register — then the checkout says
    the national range, which is true of every address. */
export function deliveryZoneFor(city: string): DeliveryZone | null {
  const key = normalizeLocality(city);
  if (!KNOWN.has(key)) return null;
  return "national";
}

/** "3–7 ימי עסקים" for a chosen city: one range for the whole country,
    whether or not the register knows the place. */
export function deliveryPromiseTextForCity(city: string): string {
  const zone = deliveryZoneFor(city) ?? "national";
  const { min, max } = DELIVERY_ZONES[zone];
  return `${min}–${max} ימי עסקים`;
}

/** Up to `limit` localities for what the shopper has typed so far. A name
    that starts with the text comes first (typing "נת" offers נתניה before
    יד נתן), then a name with a later word starting with it (פרדס חנה for
    "חנה"), then anything merely containing it. Inside a tier the major
    cities come first and then the shorter name — נתניה before נתיב הגדוד,
    Tel Aviv before תלם. */
export function suggestLocalities(typed: string, limit = 8): string[] {
  const q = normalizeLocality(typed);
  if (!q) return [];
  const tiers: string[][] = [[], [], []];
  for (const name of localities.names) {
    const n = normalizeLocality(name);
    if (n.startsWith(q)) tiers[0].push(name);
    else if (n.split(/[ -]/).some((w) => w.startsWith(q))) tiers[1].push(name);
    else if (n.includes(q)) tiers[2].push(name);
  }
  const rank = (n: string) => MAJOR_RANK.get(n) ?? MAJOR_LOCALITIES.length;
  const order = (a: string, b: string) => rank(a) - rank(b) || a.length - b.length;
  return tiers.flatMap((t) => t.sort(order)).slice(0, limit);
}
