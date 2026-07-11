import type { Notification, NotificationPriority, NotificationType } from "@prisma/client";

import type { DbClient } from "../db-client";

export type { Notification, NotificationPriority, NotificationType };

export interface CreateNotificationInput {
  schoolId: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  body: string;
  actionUrl?: string | null;
}

/**
 * Persistence for the immutable `Notification` event record (ADR-003, ADR-018).
 * No authorization/business rules. The per-user read/archive state lives on
 * `NotificationRecipient`; this table is write-once (no update/delete).
 */
export interface NotificationRepository {
  create(input: CreateNotificationInput): Promise<Notification>;
}

export function createNotificationRepository(client: DbClient): NotificationRepository {
  return {
    create: (input) =>
      client.notification.create({
        data: {
          schoolId: input.schoolId,
          type: input.type,
          priority: input.priority,
          title: input.title,
          body: input.body,
          actionUrl: input.actionUrl ?? null,
        },
      }),
  };
}
