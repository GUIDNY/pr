"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// Backs the homepage "אלפרד ממליץ" widget (the hero's chat panel) — up to
// 3 admin-picked products, stored as a HomepageSection payload (the same
// "admin edits JSON, no deploy needed" pattern already used for hero/
// why-prec) rather than a new column/table.
export async function updateAlfredWidgetPicksAction(productIds: string[]) {
  const session = await requireAdmin();
  const ids = productIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0).slice(0, 3);

  await db.homepageSection.upsert({
    where: { key: "alfred-widget" },
    create: { key: "alfred-widget", payload: JSON.stringify({ productIds: ids }), isActive: true },
    update: { payload: JSON.stringify({ productIds: ids }) },
  });
  await logAudit({
    actorId: session.sub,
    action: "ALFRED_WIDGET_PICKS_UPDATED",
    entityType: "HomepageSection",
    entityId: "alfred-widget",
  });
  revalidatePath("/");
  revalidatePath("/admin/homepage-alfred");
  return { success: true };
}
