import "server-only";
import { db } from "@/lib/db";
import { createHash } from "node:crypto";
import { uploadInventoryFile } from "./storage";
import { stampSourceRowKeys } from "./backfill-row-keys";
import { INVENTORY_SOURCES } from "./sheet-map";

/**
 * Taking in a new copy of a price sheet.
 *
 * One function with two doors in front of it: the admin's upload form, and
 * the agent on a machine inside the company network that pushes the same
 * three files twice a day (see scripts/agent/). They were one code path from
 * the start rather than two that drifted, because the delicate part below —
 * stamping row keys before the incoming file shifts every row — is not
 * something a second caller would remember to do.
 *
 * THE SHEETS THEMSELVES ARE NEVER WRITTEN TO. This receives bytes that some
 * caller already read; nothing here or downstream reaches back to the file
 * server. See CLAUDE.md.
 */
export type IngestResult = {
  /** sha256 of what was stored, so a caller can tell an identical re-upload
      from a real change without downloading it again. */
  sha256: string;
  bytes: number;
  storagePath: string;
  /** False when the incoming bytes are identical to the copy already held.
      The file is still stored — a second copy costs nothing and keeps the
      history — but the caller can skip the sync. */
  changed: boolean;
};

export async function ingestSourceFile(input: {
  key: string;
  /** The real, usually Hebrew, filename. Kept for display only. */
  filename: string;
  bytes: Buffer;
  /** Who to record as the uploader. Null for the unattended agent, which is
      a fact worth keeping rather than papering over: an upload with no
      person behind it should read that way in the source list. */
  actorId?: string | null;
}): Promise<IngestResult> {
  const known = INVENTORY_SOURCES.find((s) => s.key === input.key);
  if (!known) throw new Error(`מקור לא מוכר: ${input.key}`);

  const sha256 = createHash("sha256").update(input.bytes).digest("hex");

  /* The last moment the products' recorded row positions and the file that
     produced them still agree. A product created from a row with no SKU is
     recognised on the next sync by sourceRowKey, and one that has never been
     synced since the column existed does not have a key yet — so it gets one
     now, from the outgoing file, before the incoming sheet shifts every row
     under an insertion and the position match stops working. Without this
     the fallback would be the product's current brand, model and title,
     which is precisely what the admin and the enrichment agent rewrite, and
     the sync would create a second copy of a curated product.

     Best-effort on purpose: an unreadable outgoing file is not a reason to
     refuse a new one. It only leaves us where we were before this ran. */
  const previous = await db.inventorySource.findUnique({
    where: { key: input.key },
    select: {
      id: true,
      key: true,
      sourceType: true,
      storagePath: true,
      sheetUrl: true,
      categorySlugOverride: true,
      fileHash: true,
    },
  });

  if (previous) {
    const needKeys = await db.product.count({
      where: { sourceId: previous.id, isTemporarySku: true, sourceRowKey: null },
    });
    if (needKeys > 0) {
      try {
        await stampSourceRowKeys(previous, { apply: true });
      } catch {
        // swallowed — see above
      }
    }
  }

  // Storage object keys must be ASCII — real (often Hebrew) filenames are
  // kept in the DB `filename` column for display instead.
  const ext = input.filename.includes(".")
    ? input.filename.slice(input.filename.lastIndexOf("."))
    : ".xlsx";
  const storagePath = `${input.key}/${Date.now()}${ext}`;

  await uploadInventoryFile(
    storagePath,
    input.bytes,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );

  /* fileHash is intentionally left untouched (not set to the just-uploaded
     content's hash) — runFullSync compares the fetched content's hash
     against the stored one to decide whether to skip a scan. Setting it here
     would make the very next sync see "unchanged" and skip importing this
     file's rows entirely. The hash is returned to the caller instead, which
     is how the agent knows whether a sync is worth triggering. */
  await db.inventorySource.upsert({
    where: { key: input.key },
    update: {
      filename: input.filename,
      storagePath,
      fileSizeBytes: input.bytes.length,
      isActive: true,
      uploadedById: input.actorId,
      uploadedAt: new Date(),
    },
    create: {
      key: input.key,
      filename: input.filename,
      storagePath,
      fileSizeBytes: input.bytes.length,
      isActive: true,
      uploadedById: input.actorId,
    },
  });

  return {
    sha256,
    bytes: input.bytes.length,
    storagePath,
    changed: previous?.fileHash !== sha256,
  };
}
