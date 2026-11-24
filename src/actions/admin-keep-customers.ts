"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

/** "טופל" / "לא רלוונטי": hides the customer until a newer attempt. Recorded in AuditLog only. */
export async function dismissKeepCustomerAction(key: string, why: "HANDLED" | "NOT_RELEVANT") {
  const session = await requireAdmin();
  if (!/^(p|e|u):.{1,120}$/.test(key)) return { success: false, error: "לקוח לא תקין" };
  await logAudit({ actorId: session.sub, action: "KEEP_CUSTOMER_DISMISSED", entityType: "KeepCustomer", entityId: key, metadata: { why } });
  revalidatePath("/admin/orders");
  return { success: true, error: null };
}

/** A note on a customer, keyed by the normalised customer key so it survives new attempts. */
export async function addKeepNoteAction(key: string, body: string) {
  const session = await requireAdmin();
  const text = body.trim().slice(0, 1000);
  if (!/^(p|e|u):.{1,120}$/.test(key) || !text) return { success: false, error: "הערה ריקה" };
  await logAudit({ actorId: session.sub, action: "KEEP_CUSTOMER_NOTE", entityType: "KeepCustomer", entityId: key, metadata: { body: text } });
  revalidatePath("/admin/orders");
  return { success: true, error: null };
}
