import { z } from "zod";

/**
 * The homepage banners, as the admin edits them and the homepage reads them.
 *
 * Stored as one HomepageSection row (key "promo-banners") holding a JSON
 * array — the same "admin edits JSON, no deploy" pattern the hero copy and
 * the Alfred picks already use, so a campaign goes up and comes down
 * without touching code or the schema. Order in the array is display
 * order; only active banners reach the site. No banners at all and the
 * homepage falls back to slides built from live data (today's best real
 * discount, the delivery rule).
 *
 * Shared by the server action and the client editor, so it must stay
 * free of server-only imports.
 */
export const BANNERS_SECTION_KEY = "promo-banners";
export const MAX_BANNERS = 8;
export const MAX_BANNER_IMAGES = 3;

export const BANNER_TONES = ["brand", "light", "navy"] as const;
export type BannerTone = (typeof BANNER_TONES)[number];
export const BANNER_TONE_LABELS: Record<BannerTone, string> = {
  brand: "כתום",
  light: "לבן",
  navy: "כחול",
};

const href = z
  .string()
  .trim()
  .min(1, "חסר יעד")
  .max(500)
  .refine((v) => v.startsWith("/") || /^https?:\/\//.test(v), "היעד חייב להתחיל ב-/ או ב-https://");

export const BANNER_LAYOUTS = ["collage", "image"] as const;
export type BannerLayout = (typeof BANNER_LAYOUTS)[number];

export const bannerSchema = z
  .object({
    id: z.string().min(1).max(40),
    // "collage": words in the shop's type on a coloured ground, product
    // photographs fanned beside them. "image": one designed picture fills
    // the whole slide — the words are in the picture, so title and body
    // are only its alt text and may be empty.
    layout: z.enum(BANNER_LAYOUTS).default("collage"),
    title: z.string().trim().max(40, "כותרת עד 40 תווים"),
    body: z.string().trim().max(60, "טקסט משני עד 60 תווים"),
    href,
    tone: z.enum(BANNER_TONES),
    images: z.array(z.string().trim().url().max(1000)).max(MAX_BANNER_IMAGES),
    // Image layout only: a second, taller cut of the same picture for the
    // card beside the desktop headline (about 3:4). Without it the wide
    // picture is shown there whole, at its own ratio.
    desktopImage: z.string().trim().url().max(1000).optional(),
    isActive: z.boolean(),
  })
  .superRefine((b, ctx) => {
    if (b.layout === "collage" && b.title.length === 0) {
      ctx.addIssue({ code: "custom", path: ["title"], message: "חסרה כותרת" });
    }
    if (b.layout === "image" && b.images.length === 0) {
      ctx.addIssue({ code: "custom", path: ["images"], message: "באנר תמונה צריך תמונה" });
    }
  });

export const bannersSchema = z.array(bannerSchema).max(MAX_BANNERS);

export type Banner = z.infer<typeof bannerSchema>;

/** Parses a stored payload leniently: a bad row is dropped, not fatal. */
export function parseStoredBanners(payload: unknown): Banner[] {
  const list = Array.isArray(payload) ? payload : (payload as { banners?: unknown })?.banners;
  if (!Array.isArray(list)) return [];
  return list.map((b) => bannerSchema.safeParse(b)).flatMap((r) => (r.success ? [r.data] : []));
}

export function newBannerId() {
  return `b_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
