import {
  archiveNotification,
  createAnnouncement,
  createServiceContext,
  deleteNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  unarchiveNotification,
  unreadNotificationCount,
} from "@repo/business";
import { createAnnouncementInput, idInput, listNotificationsInput } from "@repo/validation";

import { protectedProcedure, router } from "../trpc";

/**
 * Notification procedures (M10, ADR-018). Thin transport only — validate (Zod) then
 * delegate to a business service; the service enforces permission + self-scope
 * (notification:manage_own on every inbox op; announcement:send on createAnnouncement),
 * resolves recipients, and writes audit in-transaction. No logic, no role strings,
 * no Prisma. `id` on the mutators is the NotificationRecipient row id (the caller's
 * own copy — the service 404s anything that isn't).
 */
export const notificationRouter = router({
  /** The caller's inbox — live (default) or archived, keyset-paged. */
  list: protectedProcedure
    .input(listNotificationsInput)
    .query(({ ctx, input }) => listNotifications(createServiceContext(ctx.user), input)),
  /** Unread & not-archived count (the bell badge). */
  unreadCount: protectedProcedure.query(({ ctx }) =>
    unreadNotificationCount(createServiceContext(ctx.user)),
  ),
  markRead: protectedProcedure
    .input(idInput)
    .mutation(({ ctx, input }) => markNotificationRead(createServiceContext(ctx.user), input.id)),
  markAllRead: protectedProcedure.mutation(({ ctx }) =>
    markAllNotificationsRead(createServiceContext(ctx.user)),
  ),
  archive: protectedProcedure
    .input(idInput)
    .mutation(({ ctx, input }) => archiveNotification(createServiceContext(ctx.user), input.id)),
  unarchive: protectedProcedure
    .input(idInput)
    .mutation(({ ctx, input }) => unarchiveNotification(createServiceContext(ctx.user), input.id)),
  delete: protectedProcedure
    .input(idInput)
    .mutation(({ ctx, input }) => deleteNotification(createServiceContext(ctx.user), input.id)),
  /** Admin composes + sends an announcement to a scope (announcement:send). */
  createAnnouncement: protectedProcedure
    .input(createAnnouncementInput)
    .mutation(({ ctx, input }) => createAnnouncement(createServiceContext(ctx.user), input)),
});
