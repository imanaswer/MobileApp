import type { Notification, NotificationRecipient } from "@prisma/client";

import type { DbClient } from "../db-client";

export type { NotificationRecipient };

export type NotificationRecipientWithEvent = NotificationRecipient & {
  notification: Notification;
};

export interface ListForUserOptions {
  /** true → archived only; false/undefined → the live inbox (not archived). */
  archived?: boolean;
  limit: number;
  /** Keyset cursor — return rows strictly older than this createdAt. */
  before?: Date;
}

/**
 * Persistence for `NotificationRecipient` (ADR-003, ADR-018) — a user's own copy
 * of an event. No authorization: every method is parameterized by `userId` so the
 * caller (the service, after `assertCan` + self-scope) can only ever touch its own
 * rows; the mutators return the affected-row count so the service can 404 a
 * non-owned/absent id.
 */
export interface NotificationRecipientRepository {
  /** Fan-out: one recipient row per user for an event (dedup on the unique). */
  createMany(notificationId: string, userIds: string[]): Promise<number>;
  listForUser(userId: string, opts: ListForUserOptions): Promise<NotificationRecipientWithEvent[]>;
  markRead(id: string, userId: string): Promise<number>;
  markAllRead(userId: string): Promise<number>;
  setArchived(id: string, userId: string, archived: boolean): Promise<number>;
  deleteForUser(id: string, userId: string): Promise<number>;
  /** Unread AND not archived (the badge count). */
  unreadCount(userId: string): Promise<number>;
}

export function createNotificationRecipientRepository(
  client: DbClient,
): NotificationRecipientRepository {
  return {
    createMany: async (notificationId, userIds) => {
      const res = await client.notificationRecipient.createMany({
        data: userIds.map((userId) => ({ notificationId, userId })),
        skipDuplicates: true,
      });
      return res.count;
    },
    listForUser: (userId, opts) =>
      client.notificationRecipient.findMany({
        where: {
          userId,
          isArchived: opts.archived ?? false,
          ...(opts.before ? { createdAt: { lt: opts.before } } : {}),
        },
        include: { notification: true },
        orderBy: { createdAt: "desc" },
        take: opts.limit,
      }),
    markRead: async (id, userId) => {
      const res = await client.notificationRecipient.updateMany({
        where: { id, userId },
        data: { isRead: true, readAt: new Date() },
      });
      return res.count;
    },
    markAllRead: async (userId) => {
      const res = await client.notificationRecipient.updateMany({
        where: { userId, isRead: false },
        data: { isRead: true, readAt: new Date() },
      });
      return res.count;
    },
    setArchived: async (id, userId, archived) => {
      const res = await client.notificationRecipient.updateMany({
        where: { id, userId },
        data: { isArchived: archived, archivedAt: archived ? new Date() : null },
      });
      return res.count;
    },
    deleteForUser: async (id, userId) => {
      const res = await client.notificationRecipient.deleteMany({ where: { id, userId } });
      return res.count;
    },
    unreadCount: (userId) =>
      client.notificationRecipient.count({ where: { userId, isRead: false, isArchived: false } }),
  };
}
