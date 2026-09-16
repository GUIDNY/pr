import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isSiteAdmin } from "@/lib/permissions";
import {
  migrateImageBatch,
  countImagesToMigrate,
  HOSTS_THAT_REFUSE_US,
} from "@/lib/inventory/image-migration";

/**
 * Migrating hotlinked product photographs onto our own storage, unattended.
 *
 * Same door as the sync route: a Vercel Cron bearer token, or a logged-in
 * owner. The point of the cron half is that nobody has to hold the Supabase
 * service key to run this — the route executes on Vercel where that key
 * already lives, so the credential never leaves the dashboard and never
 * passes through a chat, a laptop or a shell.
 *
 * What this is FOR is the trickle, not the backlog. The sheet creates new
 * products with new hotlinks every time it is synced, so without something
 * like this the catalogue drifts back to where it started; a daily pass
 * keeps it at zero once it gets there. Clearing the existing 2,600 is a
 * different shape of job — see the note on the time budget below — and the
 * owner's screen at /admin/inventory/image-migration does that in one
 * sitting.
 *
 * Deliberately no `hosts` filter here: the cron's job is "whatever is left",
 * and blocked hosts are excluded inside the library where no caller can
 * opt out.
 */

// Vercel caps a function at the plan's limit; 60 is the Hobby ceiling and
// well inside Pro's, so this is the value that is safe on either.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/* Stop well before the platform kills the request. A killed invocation
   loses nothing — every image is committed on its own — but it also
   reports nothing, and a run whose outcome is invisible is one nobody
   notices has been failing. */
const TIME_BUDGET_MS = 45_000;
const BATCH = 4;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  const hasValidSecret = secret ? auth === `Bearer ${secret}` : false;

  if (!hasValidSecret) {
    const session = await getSession();
    if (!session || !isSiteAdmin(session.role)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const startedAt = Date.now();
  let migrated = 0;
  let failed = 0;
  let configured = true;

  while (Date.now() - startedAt < TIME_BUDGET_MS) {
    const result = await migrateImageBatch({ size: BATCH, excludeHosts: HOSTS_THAT_REFUSE_US });
    if (!result.configured) {
      configured = false;
      break;
    }
    migrated += result.migrated;
    failed += result.failed.length;
    // Nothing attempted means nothing is left; nothing migrated out of a
    // full batch means what is left cannot be migrated. Either way, looping
    // again only burns the budget.
    if (result.attempted === 0 || result.migrated === 0) break;
  }

  return NextResponse.json({
    configured,
    migrated,
    failed,
    remaining: configured ? await countImagesToMigrate(undefined, HOSTS_THAT_REFUSE_US) : null,
    tookMs: Date.now() - startedAt,
  });
}
