import type { Prisma } from "@prisma/client";

import type { DbClient } from "../db-client";

/**
 * An audit entry. `before`/`after` hold the CHANGED fields (JSON-safe), not whole
 * rows (ADR-007). The business layer builds these; the repository only persists.
 */
export interface AuditEntry {
  schoolId: string;
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
}

/** Append-only audit writer. Called within the same transaction as the mutation. */
export interface AuditLogRepository {
  record(entry: AuditEntry): Promise<void>;
}

export function createAuditLogRepository(client: DbClient): AuditLogRepository {
  return {
    record: async (entry) => {
      await client.auditLog.create({
        data: {
          schoolId: entry.schoolId,
          actorUserId: entry.actorUserId,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          // Only set JSON columns when provided (strict optional properties).
          ...(entry.before !== undefined ? { beforeJson: entry.before } : {}),
          ...(entry.after !== undefined ? { afterJson: entry.after } : {}),
        },
      });
    },
  };
}
