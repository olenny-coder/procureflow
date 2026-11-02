import { getDb } from "@procureflow/db";
import { auditEvents } from "@procureflow/db/schema";
import type { AuditAction } from "@procureflow/shared";

export interface RecordAuditOptions {
  entityType: string;
  entityId: string;
  action: AuditAction | string;
  actorId?: string | null;
  metadata?: Record<string, unknown>;
  dedupeKey?: string | null;
}

/** Append an audit event. `dedupeKey` makes retries idempotent. */
export async function recordAudit(options: RecordAuditOptions): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .insert(auditEvents)
    .values({
      entityType: options.entityType,
      entityId: options.entityId,
      action: options.action,
      actorId: options.actorId ?? null,
      metadata: options.metadata ?? {},
      dedupeKey: options.dedupeKey ?? null,
    })
    .onConflictDoNothing({ target: auditEvents.dedupeKey })
    .returning({ id: auditEvents.id });
  return row?.id ?? null;
}
