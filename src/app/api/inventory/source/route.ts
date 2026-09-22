import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManageCatalog } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { ingestSourceFile } from "@/lib/inventory/ingest-source";
import { INVENTORY_SOURCES } from "@/lib/inventory/sheet-map";
import { isStorageConfigured } from "@/lib/inventory/storage";

/**
 * The door the price sheets come in through, unattended.
 *
 * The three workbooks live on the company's file server, which Vercel has no
 * route to and never will. So the direction is inward: a small agent on a
 * machine inside that network reads the files and posts them here twice a
 * day. See scripts/agent/ for the agent and how it is installed.
 *
 * WHY THIS EXISTS AT ALL, given the admin already has an upload form: that
 * form is a Server Action, and a Server Action needs a session. A scheduled
 * job has no session and should not be given one — a long-lived admin cookie
 * sitting in a launchd plist is a worse credential than a scoped secret that
 * can do exactly this one thing.
 *
 * It stores and returns; it does not sync. The two are separate calls because
 * their durations are not comparable — storing three files is a second, a
 * full sync over 1,700 rows is minutes — and a single request that does both
 * is a request that gets killed halfway through the part that matters. The
 * agent posts the files, reads back which ones actually changed, and calls
 * /api/inventory/sync only if any did.
 *
 * THE FILES ON THE SHARE ARE NEVER TOUCHED. Nothing downstream of here has a
 * route back to that server. See CLAUDE.md.
 */

export const dynamic = "force-dynamic";
// Three workbooks are about 1.4MB together today, comfortably inside the
// request body limit. Generous anyway, because a sheet grows.
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.INVENTORY_AGENT_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  /* Either the agent's secret, or a signed-in person who could have used the
     admin form anyway. The session branch is what makes this testable from a
     browser without putting the secret somewhere it can be read. */
  if (!authorized(request)) {
    const session = await getSession();
    if (!session || !canManageCatalog(session.role)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  /* Said before anything is read, because the failure is otherwise invisible:
     without the storage credentials the upload throws deep inside, the agent
     logs "failed", and nobody learns that the cause is a missing env var. */
  if (!isStorageConfigured()) {
    return NextResponse.json({ error: "אחסון הקבצים אינו מוגדר" }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "גוף הבקשה אינו multipart/form-data" }, { status: 400 });
  }

  /* One request carries all three sheets. They are a set — the sync merges
     every active source in one pass — so uploading them one request at a
     time opens a window where the catalogue is half old and half new. */
  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "לא צורף קובץ" }, { status: 400 });
  }

  const session = await getSession();
  const results: Record<string, unknown>[] = [];
  let anyChanged = false;

  for (const file of files) {
    /* The source key comes from the filename, matched against the list the
       parser already keys its per-tab category map by. Deriving it rather
       than asking the agent to send it means the agent cannot quietly file
       the white-goods sheet under electronics — and the mapping is already
       the contract between the file server and this code. */
    const known = INVENTORY_SOURCES.find((s) => s.filename === file.name);
    if (!known) {
      results.push({ filename: file.name, ok: false, error: "שם קובץ לא מוכר" });
      continue;
    }

    try {
      const bytes = Buffer.from(await file.arrayBuffer());
      const result = await ingestSourceFile({
        key: known.key,
        filename: file.name,
        bytes,
        actorId: session?.sub ?? null,
      });
      if (result.changed) anyChanged = true;
      results.push({ filename: file.name, key: known.key, ok: true, ...result });
      await logAudit({
        actorId: session?.sub ?? null,
        action: "INVENTORY_SOURCE_UPLOADED",
        entityType: "InventorySource",
        entityId: known.key,
        metadata: { via: "agent", bytes: result.bytes, changed: result.changed },
      });
    } catch (err) {
      results.push({
        filename: file.name,
        key: known.key,
        ok: false,
        error: err instanceof Error ? err.message : "העלאה נכשלה",
      });
    }
  }

  const failed = results.filter((r) => !r.ok).length;
  return NextResponse.json(
    {
      stored: results.length - failed,
      failed,
      // What the agent decides on: no change, no sync, no 1,700-row scan.
      anyChanged,
      results,
    },
    // A partial failure is not a success. The agent retries on a non-2xx and
    // a silent 200 with two of three files stored is the shape of a bug
    // nobody finds until the catalogue is a week stale.
    { status: failed > 0 ? 207 : 200 },
  );
}
