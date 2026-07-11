import { PERMISSIONS } from "@repo/constants";
import { NotFoundError } from "@repo/core";
import type { NotificationDto, NotificationPriorityKey, NotificationTypeKey } from "@repo/types";

import { assertCan } from "../../authorization";
import type { ServiceContext } from "../../context";
import { recordAudit } from "../people/scope";

import { mapNotification } from "./mappers";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

// ---------------------------------------------------------------------------
// Creation — internal primitives (ADR-018 §3/§4).
//
// NO independent permission check: notification creation is a POST-authorization
// side effect. The action that triggers it (a publish the actor was already
// authorized for, or createAnnouncement which asserts announcement:send) is the
// gate; emit* runs AFTER that transaction has committed. Recipients are resolved
// by the caller and stored EXPLICITLY here (no dynamic recipient query at read
// time). One Notification + N recipient rows + one AuditLog row, atomically.
// ---------------------------------------------------------------------------

export interface CreateNotificationInput {
  type: NotificationTypeKey;
  priority?: NotificationPriorityKey;
  title: string;
  body: string;
  actionUrl?: string | null;
  userIds: string[];
}

export interface CreateNotificationResult {
  notificationId: string | null;
  recipientCount: number;
}

/** Fan one event out to many users. De-dups userIds; a no-op when the set is empty. */
export async function createBulkNotification(
  ctx: ServiceContext,
  input: CreateNotificationInput,
): Promise<CreateNotificationResult> {
  const userIds = [...new Set(input.userIds)];
  if (userIds.length === 0) {
    return { notificationId: null, recipientCount: 0 };
  }
  const priority = input.priority ?? "NORMAL";
  return ctx.withTransaction(async (repos) => {
    const notification = await repos.notifications.create({
      schoolId: ctx.user.schoolId,
      type: input.type,
      priority,
      title: input.title,
      body: input.body,
      actionUrl: input.actionUrl ?? null,
    });
    const recipientCount = await repos.notificationRecipients.createMany(notification.id, userIds);
    await recordAudit(ctx, repos, {
      action: "NOTIFICATION_CREATE",
      entityType: "Notification",
      entityId: notification.id,
      after: { type: input.type, priority, recipientCount },
    });
    return { notificationId: notification.id, recipientCount };
  });
}

/** Single-recipient convenience over {@link createBulkNotification}. */
export function createNotification(
  ctx: ServiceContext,
  input: Omit<CreateNotificationInput, "userIds"> & { userId: string },
): Promise<CreateNotificationResult> {
  const { userId, ...rest } = input;
  return createBulkNotification(ctx, { ...rest, userIds: [userId] });
}

// ---------------------------------------------------------------------------
// Inbox — self-scope (notification:manage_own). Every method acts ONLY on the
// caller's own recipient rows (userId = self), enforced in the repo query; the
// mutators 404 an id that isn't the caller's. Every mutation is audited (ADR-007;
// the markRead trail doubles as a read-receipt — proof a parent saw an event).
// ---------------------------------------------------------------------------

export interface ListNotificationsInput {
  /** true → archived only; false/undefined → the live inbox. */
  archived?: boolean | undefined;
  limit?: number | undefined;
  /** ISO createdAt keyset cursor — return events strictly older than this. */
  before?: string | undefined;
}

export async function listNotifications(
  ctx: ServiceContext,
  input: ListNotificationsInput = {},
): Promise<NotificationDto[]> {
  assertCan(ctx.user, PERMISSIONS.NOTIFICATION_MANAGE_OWN);
  const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const rows = await ctx.repositories.notificationRecipients.listForUser(ctx.user.userId, {
    ...(input.archived !== undefined ? { archived: input.archived } : {}),
    limit,
    ...(input.before ? { before: new Date(input.before) } : {}),
  });
  return rows.map(mapNotification);
}

/** Unread AND not archived — the badge count. */
export async function unreadNotificationCount(ctx: ServiceContext): Promise<number> {
  assertCan(ctx.user, PERMISSIONS.NOTIFICATION_MANAGE_OWN);
  return ctx.repositories.notificationRecipients.unreadCount(ctx.user.userId);
}

export async function markNotificationRead(
  ctx: ServiceContext,
  recipientId: string,
): Promise<void> {
  assertCan(ctx.user, PERMISSIONS.NOTIFICATION_MANAGE_OWN);
  await ctx.withTransaction(async (repos) => {
    const count = await repos.notificationRecipients.markRead(recipientId, ctx.user.userId);
    if (count === 0) {
      throw new NotFoundError("Notification not found");
    }
    await recordAudit(ctx, repos, {
      action: "NOTIFICATION_READ",
      entityType: "NotificationRecipient",
      entityId: recipientId,
    });
  });
}

/** Mark every unread notification read. Returns how many flipped. */
export async function markAllNotificationsRead(ctx: ServiceContext): Promise<number> {
  assertCan(ctx.user, PERMISSIONS.NOTIFICATION_MANAGE_OWN);
  return ctx.withTransaction(async (repos) => {
    const count = await repos.notificationRecipients.markAllRead(ctx.user.userId);
    await recordAudit(ctx, repos, {
      action: "NOTIFICATION_READ_ALL",
      entityType: "NotificationRecipient",
      entityId: ctx.user.userId,
      after: { count },
    });
    return count;
  });
}

async function setNotificationArchived(
  ctx: ServiceContext,
  recipientId: string,
  archived: boolean,
): Promise<void> {
  assertCan(ctx.user, PERMISSIONS.NOTIFICATION_MANAGE_OWN);
  await ctx.withTransaction(async (repos) => {
    const count = await repos.notificationRecipients.setArchived(
      recipientId,
      ctx.user.userId,
      archived,
    );
    if (count === 0) {
      throw new NotFoundError("Notification not found");
    }
    await recordAudit(ctx, repos, {
      action: archived ? "NOTIFICATION_ARCHIVE" : "NOTIFICATION_UNARCHIVE",
      entityType: "NotificationRecipient",
      entityId: recipientId,
    });
  });
}

/** Soft delete — hide from the live inbox (reversible via {@link unarchiveNotification}). */
export function archiveNotification(ctx: ServiceContext, recipientId: string): Promise<void> {
  return setNotificationArchived(ctx, recipientId, true);
}

export function unarchiveNotification(ctx: ServiceContext, recipientId: string): Promise<void> {
  return setNotificationArchived(ctx, recipientId, false);
}

/** Permanently remove the caller's OWN copy (ADR-018 §2) — the shared event and
 * every other recipient are untouched. */
export async function deleteNotification(ctx: ServiceContext, recipientId: string): Promise<void> {
  assertCan(ctx.user, PERMISSIONS.NOTIFICATION_MANAGE_OWN);
  await ctx.withTransaction(async (repos) => {
    const count = await repos.notificationRecipients.deleteForUser(recipientId, ctx.user.userId);
    if (count === 0) {
      throw new NotFoundError("Notification not found");
    }
    await recordAudit(ctx, repos, {
      action: "NOTIFICATION_DELETE",
      entityType: "NotificationRecipient",
      entityId: recipientId,
    });
  });
}
