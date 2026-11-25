import "server-only";
import { createHash } from "crypto";
import { db } from "@/lib/db";
import { emailChannel } from "@/lib/notify/channels";
import { paymentAlertRecipients } from "@/lib/notify/payment-alert";

/**
 * Brute-force protection for loginAction, with no new table.
 *
 * - Every failed attempt is an AuditLog row (action LOGIN_FAILED). The login
 *   name is stored only as a hash, so the log never holds an address.
 * - 10 failures inside 15 minutes lock that login name for the rest of the
 *   window: even the right password is refused, with the same message as a
 *   wrong one. Failures made while locked are not logged, so the lock lapses
 *   15 minutes after the tenth.
 * - Locking a back-office account (ADMIN / STAFF / SELLER) mails the owner
 *   through the payment-alert recipients.
 *
 * A known cost of any lockout: somebody who knows an address can keep that
 * account locked. Accepted — a locked customer can use "forgot password".
 */

export const LOCK_FAILURES = 10;
export const LOCK_WINDOW_MS = 15 * 60_000;
const STAFF_ROLES = ["ADMIN", "STAFF", "SELLER"];

/** Stable, non-reversible key for a login name (email lower-cased, phone normalised by the caller). */
export function loginKey(identifier: string): string {
  return createHash("sha256").update(`login:${identifier.trim().toLowerCase()}`).digest("hex");
}

export async function isLocked(key: string): Promise<boolean> {
  const failures = await db.auditLog.count({
    where: { action: "LOGIN_FAILED", entityType: "LOGIN", entityId: key, createdAt: { gt: new Date(Date.now() - LOCK_WINDOW_MS) } },
  });
  return failures >= LOCK_FAILURES;
}

/** Record a failure; on the one that reaches the limit, alert if it is a team account. */
export async function recordFailure(key: string, user: { email: string; role: string } | null | undefined): Promise<void> {
  try {
    await db.auditLog.create({ data: { action: "LOGIN_FAILED", entityType: "LOGIN", entityId: key } });
    const failures = await db.auditLog.count({
      where: { action: "LOGIN_FAILED", entityType: "LOGIN", entityId: key, createdAt: { gt: new Date(Date.now() - LOCK_WINDOW_MS) } },
    });
    if (failures === LOCK_FAILURES && user && STAFF_ROLES.includes(user.role) && emailChannel.configured()) {
      const body = `חשבון צוות ננעל ל-15 דקות אחרי ${LOCK_FAILURES} ניסיונות התחברות כושלים.\nחשבון: ${user.email} (${user.role})\nאם זה לא אתם, כדאי להחליף סיסמה.`;
      await Promise.allSettled(
        paymentAlertRecipients().map((to) => emailChannel.send(to, { subject: "⚠️ חשבון צוות ננעל אחרי ניסיונות התחברות כושלים", body })),
      );
    }
  } catch (error) {
    console.error("[login-guard] could not record a failed login", error);
  }
}
