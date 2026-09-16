"use server";

import { revalidatePath } from "next/cache";
import { requireSiteAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { migrateImageBatch, countImagesToMigrate } from "@/lib/inventory/image-migration";

/**
 * Moving the catalogue's photographs onto our own storage, a batch at a time.
 *
 * Owner-only. It rewrites the image URL of every product in the shop, it
 * spends storage, and it fetches a few thousand files from other people's
 * servers — none of which is a thing a seller or a catalogue manager should
 * be able to start by clicking something.
 *
 * It runs here rather than as a script because the Supabase service key
 * lives in the Vercel dashboard and nowhere else: a script would need
 * somebody to hold a production secret on a laptop. Here it runs where the
 * key already is, and the browser only drives the loop.
 */

/** Small enough to finish inside the platform's default request cap, with
    room for the slowest host in the set. Twenty images at a second or two
    each is already close. */
const BATCH_SIZE = 8;

export async function migrateImagesBatchAction(hosts?: string[]) {
  const session = await requireSiteAdmin();
  const result = await migrateImageBatch({ hosts, size: BATCH_SIZE });

  if (result.migrated > 0) {
    await logAudit({
      actorId: session.sub,
      action: "PRODUCT_IMAGES_MIGRATED",
      entityType: "ProductImage",
      entityId: hosts?.join(",") ?? "all",
      metadata: { migrated: result.migrated, failed: result.failed.length, remaining: result.remaining },
    });
    // The product pages themselves are revalidated by their own paths on a
    // normal edit; here the whole catalogue moved, so the listing surfaces
    // are what need refreshing.
    revalidatePath("/admin/inventory/image-migration");
  }

  return {
    attempted: result.attempted,
    migrated: result.migrated,
    remaining: result.remaining,
    configured: result.configured,
    failed: result.failed.map((f) => ("reason" in f ? { url: f.from, reason: f.reason } : null)).filter(Boolean),
  };
}

export async function countImagesToMigrateAction(hosts?: string[]) {
  await requireSiteAdmin();
  return countImagesToMigrate(hosts);
}
