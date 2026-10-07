import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/site-url";

/**
 * The three places a page has to say its own name, said once.
 *
 * Next merges metadata per key, not per field: a page that returns `title`
 * and `description` and says nothing about `openGraph` or `twitter`
 * inherits the root layout's blocks whole. The root's blocks are the
 * homepage's — so every product, category and brand page was handing
 * WhatsApp, Facebook and X a card that read "Buy Today - הדרך החכמה לקנות
 * אלקטרוניקה" under a link to a washing machine. The page's own <title>
 * was right the entire time, which is why it survived this long: the
 * defect is only visible in a share preview, and nobody shares the page
 * they are building.
 *
 * So the rule is that no page writes an openGraph block by hand. It calls
 * this, and the three stay in step by construction.
 */
export function shareMetadata(input: {
  title: string;
  description?: string | null;
  /** Site-relative, e.g. /product/abc. Becomes the canonical and og:url. */
  path: string;
  /** One image, absolute or site-relative. The product photo, the cover. */
  image?: string | null;
  /** "website" for a listing, "article" for an article. */
  type?: "website" | "article";
}): Metadata {
  const description = input.description?.trim() || undefined;
  const images = input.image ? [{ url: absolute(input.image) }] : undefined;
  return {
    title: input.title,
    description,
    alternates: { canonical: input.path },
    openGraph: {
      type: input.type ?? "website",
      url: absoluteUrl(input.path),
      title: input.title,
      description,
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: input.title,
      description,
      images: images?.map((i) => i.url),
    },
  };
}

/* A product image is already an absolute URL on a CDN; a cover or a logo is
   a path on this site. Both have to leave here absolute, because a scraper
   fetching the card has no base to resolve against. */
function absolute(url: string): string {
  return /^https?:\/\//i.test(url) ? url : absoluteUrl(url);
}
