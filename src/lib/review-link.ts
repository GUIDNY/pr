import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { SITE_URL } from "@/lib/site-url";

/**
 * The link in a review request: /review/<orderNumber>?t=<signature>.
 *
 * Signed so that only the person the request was sent to can review that
 * order's products — an order number alone is six guessable digits.
 */
function sign(orderNumber: string): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return createHmac("sha256", secret).update(`review:${orderNumber}`).digest("base64url").slice(0, 24);
}

export function reviewUrl(orderNumber: string): string {
  return `${SITE_URL}/review/${encodeURIComponent(orderNumber)}?t=${sign(orderNumber)}`;
}

export function verifyReviewToken(orderNumber: string, t: string | undefined | null): boolean {
  if (!t) return false;
  const want = Buffer.from(sign(orderNumber));
  const got = Buffer.from(t);
  return want.length === got.length && timingSafeEqual(want, got);
}
