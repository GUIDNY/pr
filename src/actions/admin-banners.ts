"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSiteAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { uploadProductImage } from "@/lib/product-image-storage";
import { BANNERS_SECTION_KEY, bannersSchema, type Banner } from "@/lib/banners";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/**
 * Replaces the homepage banners with the list as the editor holds it.
 * Owner only: what the shop advertises about itself is not a staff task.
 */
export async function saveBannersAction(input: unknown): Promise<{ success: boolean; error?: string; banners?: Banner[] }> {
  let session;
  try {
    session = await requireSiteAdmin();
  } catch {
    return { success: false, error: "רק המנהל הראשי יכול לערוך באנרים" };
  }
  const parsed = bannersSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { success: false, error: first ? `${first.message} (באנר ${(Number(first.path[0]) || 0) + 1})` : "נתונים לא תקינים" };
  }
  const banners = parsed.data;
  await db.homepageSection.upsert({
    where: { key: BANNERS_SECTION_KEY },
    create: { key: BANNERS_SECTION_KEY, payload: JSON.stringify(banners), isActive: true },
    update: { payload: JSON.stringify(banners), isActive: true },
  });
  await logAudit({
    actorId: session.sub,
    action: "HOMEPAGE_BANNERS_UPDATED",
    entityType: "HomepageSection",
    entityId: BANNERS_SECTION_KEY,
    metadata: { count: banners.length, active: banners.filter((b) => b.isActive).length },
  });
  revalidatePath("/");
  revalidatePath("/admin/banners");
  return { success: true, banners };
}

/** Uploads one banner image to the public image bucket and returns its URL. */
export async function uploadBannerImageAction(formData: FormData): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    await requireSiteAdmin();
  } catch {
    return { success: false, error: "רק המנהל הראשי יכול להעלות תמונות באנר" };
  }
  const file = formData.get("file");
  if (!(file instanceof File)) return { success: false, error: "לא התקבל קובץ" };
  if (!file.type.startsWith("image/")) return { success: false, error: "הקובץ שנבחר אינו תמונה" };
  if (file.size > MAX_UPLOAD_BYTES) return { success: false, error: "התמונה גדולה מדי (מקסימום 8MB)" };

  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
  const path = `banners/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}${ext}`;
  try {
    const url = await uploadProductImage(path, bytes, file.type);
    return { success: true, url };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "העלאת התמונה נכשלה" };
  }
}
