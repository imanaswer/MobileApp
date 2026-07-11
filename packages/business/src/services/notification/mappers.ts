import type { NotificationRecipientWithEvent } from "@repo/db";
import type { IsoUtcString, NotificationDto } from "@repo/types";

const iso = (d: Date | null): IsoUtcString | null => (d ? (d.toISOString() as IsoUtcString) : null);

/**
 * A recipient row (joined with its event) → the per-user {@link NotificationDto}.
 * `id` is the recipient row id (the handle the client acts on); the event fields
 * are read-only, the read/archive state is this user's own.
 */
export function mapNotification(row: NotificationRecipientWithEvent): NotificationDto {
  const n = row.notification;
  return {
    id: row.id,
    notificationId: n.id,
    type: n.type,
    priority: n.priority,
    title: n.title,
    body: n.body,
    actionUrl: n.actionUrl,
    createdAt: n.createdAt.toISOString() as IsoUtcString,
    isRead: row.isRead,
    readAt: iso(row.readAt),
    isArchived: row.isArchived,
    archivedAt: iso(row.archivedAt),
  };
}
