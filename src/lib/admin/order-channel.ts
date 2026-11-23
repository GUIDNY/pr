import { attributionFromJson, type AttributionTouch } from "@/lib/attribution";

/**
 * Which of the owner's five channels an order belongs to.
 *
 * The attribution cookie keeps a free-text source and medium (lib/attribution.ts).
 * The dashboard needs five buckets, so this is the one place that says which
 * source lands where. Pure, so check:dashboard-trends can pin it.
 */
export const CHANNELS = ["google_paid", "google_organic", "ai", "social", "direct", "other"] as const;
export type Channel = (typeof CHANNELS)[number];

export const CHANNEL_LABELS: Record<Channel, string> = {
  google_paid: "גוגל ממומן ושופינג",
  google_organic: "גוגל אורגני",
  ai: "ChatGPT ו־AI",
  social: "רשתות חברתיות",
  direct: "כניסה ישירה",
  other: "אחר",
};

const AI_SOURCE = /chatgpt|openai|perplexity|claude|anthropic|gemini|copilot|bard|you\.com|phind/i;
const SOCIAL_SOURCE = /facebook|instagram|tiktok|youtube|twitter|^x$|telegram|whatsapp|linkedin|pinterest|snapchat|reddit/i;

export function channelOfTouch(t: AttributionTouch | undefined): Channel {
  if (!t) return "other";
  const source = (t.source ?? "").toLowerCase();
  const medium = (t.medium ?? "").toLowerCase();
  const referrer = (t.referrer ?? "").toLowerCase();

  /* An AI assistant first: ChatGPT sends utm_source=chatgpt, and a referral
     from gemini.google.com must not be read as Google organic. */
  if (AI_SOURCE.test(source) || AI_SOURCE.test(referrer)) return "ai";

  if (t.gclid || t.gbraid || t.wbraid) return "google_paid";
  if (source === "google" && (medium === "cpc" || medium === "shopping")) return "google_paid";
  if (source === "google" && medium === "organic") return "google_organic";
  if (source === "google") return "google_organic";

  if (source === "direct") return "direct";
  if (SOCIAL_SOURCE.test(source) || medium === "social" || medium === "paid-social") return "social";
  return "other";
}

/** `which` picks the touch: "last" is the campaign click before the order,
    "first" is what brought the person to the shop. An order with no
    attribution at all is "direct" — the cookie is absent exactly when the
    visitor arrived with nothing to record. */
export function channelOfOrder(attribution: unknown, which: "first" | "last"): Channel {
  const a = attributionFromJson(attribution);
  if (!a) return "direct";
  return channelOfTouch(which === "last" ? (a.last ?? a.first) : a.first);
}
