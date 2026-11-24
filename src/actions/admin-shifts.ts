"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireBackOffice } from "@/lib/auth";
import { canManageCatalog } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { SHIFT_PEOPLE, isValidDate } from "@/lib/shifts/week";

async function admin() {
  const session = await requireBackOffice();
  if (!canManageCatalog(session.role)) throw new Error("אין הרשאה");
  return session;
}

/** person "" clears the day. */
export async function setShiftAction(date: string, person: string) {
  const session = await admin();
  if (!isValidDate(date)) return { ok: false as const, error: "תאריך לא תקין" };
  if (person === "") {
    await db.orderShift.deleteMany({ where: { date } });
  } else {
    if (!(SHIFT_PEOPLE as readonly string[]).includes(person)) return { ok: false as const, error: "שם לא תקין" };
    await db.orderShift.upsert({
      where: { date },
      create: { date, person, updatedById: session.sub },
      update: { person, updatedById: session.sub },
    });
  }
  await logAudit({ actorId: session.sub, action: "ORDER_SHIFT_SET", entityType: "OrderShift", entityId: date, metadata: { person } });
  revalidatePath("/admin/shifts");
  return { ok: true as const };
}

export async function saveShiftPhonesAction(idan: string, asaf: string) {
  const session = await admin();
  const clean = (v: string) => v.replace(/[^\d+]/g, "").slice(0, 16);
  for (const [key, value] of [["phone_idan", clean(idan)], ["phone_asaf", clean(asaf)]] as const) {
    await db.shiftSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }
  await logAudit({ actorId: session.sub, action: "ORDER_SHIFT_PHONES_SAVED", entityType: "ShiftSetting", entityId: "phones" });
  revalidatePath("/admin/shifts");
  return { ok: true as const };
}
