import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * "I read the sheets and they had not changed."
 *
 * The agent uploads only what differs — three identical workbooks pushed
 * twice a day is exactly the egress that took Storage down in September.
 * The consequence is that a quiet supplier and a dead agent look the same
 * from here: in both cases nothing arrives. The watchdog measures arrival,
 * so it used to raise SYNC_STALE on the second quiet day of a system that
 * was working perfectly — the false alarm its own comment warns against.
 *
 * This is the missing signal, and it is deliberately the smallest one that
 * closes the gap: a few bytes over HTTPS saying which sources were read.
 * It stamps `lastScannedAt` and nothing else. It never touches
 * `uploadedAt`, `fileHash` or `storagePath`, so it cannot be mistaken for
 * an upload, and a sheet that genuinely stopped arriving still shows an old
 * upload time on every screen that reads one.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function POST(request: Request) {
  const secret = process.env.INVENTORY_AGENT_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  /* The keys the agent actually read. A run that found two of the three
     sheets should not vouch for the third, so an absent key is left with
     its old timestamp rather than stamped along with the rest. No body at
     all means "all of them", which is what an older agent sends. */
  let keys: string[] | null = null;
  try {
    const body = (await request.json()) as unknown;
    const raw = (body as { keys?: unknown })?.keys;
    if (Array.isArray(raw)) keys = raw.filter((k): k is string => typeof k === "string");
  } catch {
    /* An empty or unparseable body is not an error here. */
  }

  const at = new Date();
  const { count } = await db.inventorySource.updateMany({
    where: {
      isActive: true,
      ...(keys && keys.length > 0 ? { key: { in: keys } } : {}),
    },
    data: { lastScannedAt: at },
  });

  return NextResponse.json({ ok: true, scanned: count, at: at.toISOString() });
}
