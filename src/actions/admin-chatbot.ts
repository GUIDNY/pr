"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function updateChatbotSettingsAction(data: {
  shippingInfo: string;
  warrantyInfo: string;
  serviceHours: string;
  additionalNotes: string;
}) {
  const session = await requireAdmin();
  const shippingInfo = data.shippingInfo.trim();
  const warrantyInfo = data.warrantyInfo.trim();
  if (!shippingInfo) return { success: false, error: "מדיניות משלוח לא יכולה להיות ריקה" };
  if (!warrantyInfo) return { success: false, error: "מדיניות אחריות לא יכולה להיות ריקה" };

  await db.chatbotSettings.upsert({
    where: { id: "singleton" },
    update: {
      shippingInfo,
      warrantyInfo,
      serviceHours: data.serviceHours.trim() || null,
      additionalNotes: data.additionalNotes.trim() || null,
    },
    create: {
      id: "singleton",
      shippingInfo,
      warrantyInfo,
      serviceHours: data.serviceHours.trim() || null,
      additionalNotes: data.additionalNotes.trim() || null,
    },
  });

  await logAudit({ actorId: session.sub, action: "CHATBOT_SETTINGS_UPDATED", entityType: "ChatbotSettings", entityId: "singleton" });

  revalidatePath("/admin/chatbot");
  return { success: true, error: null };
}
