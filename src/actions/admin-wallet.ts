"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSiteAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { adjustWallet, walletEnabled } from "@/lib/wallet";

/**
 * A manual line on a customer's BuyToday balance — a goodwill credit, or
 * taking back a top-up that was refunded by hand at Pelecard. The owner's
 * alone: it creates or removes money a customer can spend. Amount in
 * shekels as typed, positive or negative; stored as agorot.
 */
export async function adjustWalletAction(input: { email: string; amount: number; note: string }) {
  const session = await requireSiteAdmin();
  if (!walletEnabled()) return { success: false as const, error: "היתרה כבויה (WALLET_ENABLED)" };

  const amountAgorot = Math.round(Number(input.amount) * 100);
  if (!Number.isFinite(amountAgorot) || amountAgorot === 0) return { success: false as const, error: "סכום לא תקין" };

  const user = await db.user.findFirst({
    where: { email: { equals: input.email.trim(), mode: "insensitive" } },
    select: { id: true },
  });
  if (!user) return { success: false as const, error: "לא נמצא חשבון עם המייל הזה" };

  const result = await adjustWallet({ userId: user.id, amountAgorot, note: input.note, actorId: session.sub });
  if (!result.ok) return { success: false as const, error: result.error };

  await logAudit({
    actorId: session.sub,
    action: "WALLET_ADJUSTED",
    entityType: "User",
    entityId: user.id,
    metadata: { amountAgorot, note: input.note.trim(), balanceAfter: result.balance },
  });
  revalidatePath("/admin/wallet");
  return { success: true as const, error: null, balance: result.balance };
}
