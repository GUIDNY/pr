import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManageCatalog } from "@/lib/permissions";
import { INVENTORY_SOURCES } from "@/lib/inventory/sheet-map";
import { downloadInventoryFile } from "@/lib/inventory/storage";
import { emailChannel } from "@/lib/notify/channels";
import { jerusalemNow } from "@/lib/instagram-plan";
import {
  recipientFrom,
  renderPriceSheetsEmail,
  SEND_HOUR,
  type SheetFacts,
} from "@/lib/price-sheets-email";

/**
 * Every morning at 07:00 (Asia/Jerusalem) the three price lists go to the
 * office mailbox as attachments. vercel.json fires at 04:00 and 05:00 UTC so
 * that one of the two lands on 07:00 in both summer and winter time; the other
 * is a no-op. Same pattern as instagram-publish.
 *
 * The files are whatever the office agent last uploaded to storage
 * (/api/inventory/source). This route only reads them — nothing here talks to
 * the file server, and nothing writes to a sheet.
 *
 * Once a day: the first run claims an AuditLog row whose primary key is the
 * date, so an overlapping or repeated call cannot send a second mail. A send
 * that fails releases the claim so a retry is possible.
 *
 * Reading needs Bearer CRON_SECRET. ?dryRun=1 renders the mail without
 * sending; ?test=1 sends it now, skipping the 07:00 check and the once-a-day
 * claim, with "[בדיקה]" in the subject. Both also accept an admin session.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const test = url.searchParams.get("test") === "1";

  const secret = process.env.CRON_SECRET;
  if (!(secret && request.headers.get("authorization") === `Bearer ${secret}`)) {
    const session = dryRun || test ? await getSession() : null;
    if (!session || !canManageCatalog(session.role))
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const nowD = new Date();
  const now = jerusalemNow(nowD);
  if (!dryRun && !test && now.hour !== SEND_HOUR)
    return NextResponse.json({ ok: true, skipped: "not 07:00 in Asia/Jerusalem", now });

  const rows = await db.inventorySource.findMany({
    where: { key: { in: INVENTORY_SOURCES.map((s) => s.key) } },
    select: { key: true, filename: true, storagePath: true, uploadedAt: true, lastScannedAt: true, fileSizeBytes: true },
  });

  const attachments: { filename: string; content: Buffer; contentType: string }[] = [];
  const sheets: SheetFacts[] = [];
  for (const known of INVENTORY_SOURCES) {
    const row = rows.find((r) => r.key === known.key);
    const filename = (row?.filename || known.filename).replace(/[\\/:*?"<>|]/g, "-");
    let bytes: Buffer | null = null;
    if (row?.storagePath && !dryRun) {
      try { bytes = await downloadInventoryFile(row.storagePath); }
      catch (e) { console.error(`[price-sheets-email] ${known.key} download failed`, e instanceof Error ? e.message : e); }
    }
    const attached = dryRun ? !!row?.storagePath : !!bytes;
    if (bytes) attachments.push({ filename: /\.xlsx?$/i.test(filename) ? filename : `${filename}.xlsx`, content: bytes, contentType: XLSX });
    sheets.push({
      label: filename.replace(/\.xlsx?$/i, ""),
      uploadedAt: row?.storagePath ? row.uploadedAt : null,
      lastScannedAt: row?.lastScannedAt ?? null,
      sizeBytes: bytes ? bytes.length : row?.fileSizeBytes ?? null,
      attached,
    });
  }

  const message = renderPriceSheetsEmail(sheets, nowD, { test });
  const to = recipientFrom(process.env.PRICE_SHEETS_EMAIL_TO);

  if (dryRun) return NextResponse.json({ dryRun: true, now, to, subject: message.subject, body: message.body, attachmentsAvailable: sheets.map((s) => s.attached) });

  if (!emailChannel.configured()) return NextResponse.json({ ok: false, error: "email not configured" }, { status: 503 });

  // Claim the day. The id is the date, so a second insert cannot succeed.
  const claimId = `price-sheets-email:${now.date}`;
  if (!test) {
    try {
      await db.auditLog.create({
        data: { id: claimId, actorId: null, action: "PRICE_SHEETS_EMAIL", entityType: "PriceSheetsEmail", entityId: now.date },
      });
    } catch {
      return NextResponse.json({ ok: true, skipped: "already sent today", date: now.date });
    }
  }

  const result = await emailChannel.send(to, { ...message, attachments });
  if (!result.ok) {
    if (!test) await db.auditLog.delete({ where: { id: claimId } }).catch(() => undefined);
    console.error("[price-sheets-email] send failed", result.error);
    return NextResponse.json({ ok: false, error: result.error.slice(0, 300) }, { status: 502 });
  }
  if (!test) {
    await db.auditLog
      .update({
        where: { id: claimId },
        data: { metadata: JSON.stringify({ attached: attachments.length, uploadedAt: sheets.map((s) => s.uploadedAt?.toISOString() ?? null) }) },
      })
      .catch(() => undefined);
  }
  return NextResponse.json({
    ok: true, sent: true, test, date: now.date, attached: attachments.length,
    sheets: sheets.map((s) => ({ label: s.label, uploadedAt: s.uploadedAt, attached: s.attached })),
  });
}
