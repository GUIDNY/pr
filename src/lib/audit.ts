import "server-only";
import { db } from "@/lib/db";

export async function logAudit(input: {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}) {
  await db.auditLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    },
  });
}
