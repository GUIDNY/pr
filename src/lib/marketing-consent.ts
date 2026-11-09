import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { SITE_URL } from "@/lib/site-url";

/**
 * Marketing consent: who may be sent an advertisement, and the way out.
 *
 * Israel's Communications Law §30A (the "spam law"): an advertisement by
 * email, SMS or WhatsApp may go only to someone who agreed in advance, must
 * say "פרסומת" at the start (in an email's subject), must name the sender,
 * and must carry a working way to refuse — and a refusal takes effect at
 * once. Statutory damages are up to 1,000 ₪ a message without proof of harm.
 *
 * Consent is the unticked box at checkout and in the account area —
 * Order.marketingOptIn and User.marketingOptIn. Either one is consent for
 * that person's address; a refusal clears both, everywhere that address
 * appears.
 */
export function hasMarketingConsent(input: { userMarketingOptIn?: boolean | null; orderMarketingOptIn?: boolean | null }): boolean {
  return !!(input.userMarketingOptIn || input.orderMarketingOptIn);
}

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

function sign(email: string): string {
  return createHmac("sha256", secret()).update(`unsubscribe:${email.trim().toLowerCase()}`).digest("base64url").slice(0, 32);
}

/** The refusal link that goes at the foot of every advertisement. */
export function unsubscribeUrl(email: string): string {
  const e = Buffer.from(email.trim().toLowerCase()).toString("base64url");
  return `${SITE_URL}/unsubscribe?e=${e}&t=${sign(email)}`;
}

/** The address an unsubscribe link names, when its signature holds. */
export function verifyUnsubscribe(e: string | undefined, t: string | undefined): string | null {
  if (!e || !t) return null;
  let email: string;
  try {
    email = Buffer.from(e, "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!email.includes("@")) return null;
  const want = Buffer.from(sign(email));
  const got = Buffer.from(t);
  return want.length === got.length && timingSafeEqual(want, got) ? email : null;
}

/** Withdraw consent for an address — every account and every order that carries it. */
export async function withdrawMarketingConsent(email: string): Promise<void> {
  const address = email.trim().toLowerCase();
  const users = await db.user.findMany({ where: { email: { equals: address, mode: "insensitive" } }, select: { id: true } });
  await db.$transaction([
    db.user.updateMany({ where: { email: { equals: address, mode: "insensitive" } }, data: { marketingOptIn: false } }),
    db.order.updateMany({
      where: {
        OR: [{ guestEmail: { equals: address, mode: "insensitive" } }, { userId: { in: users.map((u) => u.id) } }],
      },
      data: { marketingOptIn: false },
    }),
  ]);
}
