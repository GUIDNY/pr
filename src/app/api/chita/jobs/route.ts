import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { chitaBotUnauthorized } from "@/lib/chita-auth";
import { CHITA_CLAIM_TTL_MS, CHITA_CARGO_PARCEL, type ChitaJob } from "@/lib/chita";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/chita/jobs — the Chita bot's work queue.
 *
 * Auth: `Authorization: Bearer ${CHITA_BOT_TOKEN}` (401 when missing/wrong or
 * when the env is unset). Each REQUESTED order is claimed atomically (one
 * conditional UPDATE per order, so two polls never get the same job) and
 * returned as `{ ok: true, jobs: ChitaJob[] }`. A CLAIMED job nobody reported
 * on for 15 minutes goes back to REQUESTED first. Nothing personal is logged.
 */
export async function GET(req: Request) {
  const denied = chitaBotUnauthorized(req);
  if (denied) return denied;

  const now = new Date();
  await db.order.updateMany({
    where: { chitaStatus: "CLAIMED", chitaUpdatedAt: { lt: new Date(now.getTime() - CHITA_CLAIM_TTL_MS) } },
    data: { chitaStatus: "REQUESTED", chitaUpdatedAt: now },
  });

  const candidates = await db.order.findMany({
    where: { chitaStatus: "REQUESTED", deletedAt: null },
    orderBy: { chitaRequestedAt: "asc" },
    take: 10,
    select: {
      id: true,
      orderNumber: true,
      guestName: true,
      guestPhone: true,
      shipCity: true,
      shipStreet: true,
      shipHouseNo: true,
      shipApartment: true,
      chitaCity: true,
      chitaStreet: true,
      chitaHouse: true,
      chitaEntrance: true,
      chitaFloor: true,
      chitaApartment: true,
      chitaNote: true,
      chitaPackages: true,
      chitaCargoCode: true,
      user: { select: { name: true, phone: true } },
    },
  });

  const jobs: ChitaJob[] = [];
  for (const o of candidates) {
    const claimed = await db.order.updateMany({
      where: { id: o.id, chitaStatus: "REQUESTED" },
      data: { chitaStatus: "CLAIMED", chitaUpdatedAt: now },
    });
    if (claimed.count === 0) continue;
    jobs.push({
      orderNumber: o.orderNumber,
      name: o.guestName ?? o.user?.name ?? "",
      phone: o.guestPhone ?? o.user?.phone ?? "",
      city: o.chitaCity ?? o.shipCity ?? "",
      street: o.chitaStreet ?? o.shipStreet ?? "",
      house: o.chitaHouse ?? o.shipHouseNo ?? "",
      entrance: o.chitaEntrance ?? "",
      floor: o.chitaFloor ?? "",
      apartment: o.chitaApartment ?? o.shipApartment ?? "",
      note: o.chitaNote ?? "",
      packages: o.chitaPackages ?? 1,
      cargoCode: o.chitaCargoCode ?? CHITA_CARGO_PARCEL,
    });
  }
  return NextResponse.json({ ok: true, jobs });
}
