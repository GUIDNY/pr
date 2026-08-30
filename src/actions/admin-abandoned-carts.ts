"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { cartFollowUpStatusSchema } from "@/lib/enums";

/**
 * Marks an abandoned checkout as called, or as not worth calling. The point of
 * the status is that it is shared: without it two people ring the same
 * customer about the same cart, which is worse than nobody ringing at all.
 */
export async function updateCartFollowUpAction(cartId: string, status: string, note?: string) {
  const session = await requireAdmin();
  const parsed = cartFollowUpStatusSchema.safeParse(status);
  if (!parsed.success) return { success: false, error: "סטטוס לא תקין" };

  const cart = await db.cart.findUnique({ where: { id: cartId } });
  if (!cart) return { success: false, error: "עגלה לא נמצאה" };

  await db.cart.update({
    where: { id: cartId },
    data: {
      followUpStatus: parsed.data,
      followUpNote: note?.trim() || null,
      followUpAt: new Date(),
      followUpById: session.sub,
    },
  });

  await logAudit({
    actorId: session.sub,
    action: "CART_FOLLOW_UP_CHANGED",
    entityType: "Cart",
    entityId: cartId,
    metadata: { from: cart.followUpStatus, to: parsed.data },
  });

  revalidatePath("/admin/abandoned");
  revalidatePath("/admin");
  return { success: true, error: null };
}
