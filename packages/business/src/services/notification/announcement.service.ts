import { PERMISSIONS } from "@repo/constants";
import { ValidationError } from "@repo/core";
import type { NotificationPriorityKey } from "@repo/types";

import { assertCan } from "../../authorization";
import type { ServiceContext } from "../../context";
import { activeYearId } from "../people/scope";

import { createBulkNotification, type CreateNotificationResult } from "./notification.service";
import { parentUserIdsForSection } from "./recipients";

export type AnnouncementScope = "SCHOOL" | "SECTION";

export interface CreateAnnouncementInput {
  scope: AnnouncementScope;
  /** Required when scope = SECTION. */
  sectionId?: string | undefined;
  /** SECTION parent resolution — defaults to the school's ACTIVE year. */
  academicYearId?: string | undefined;
  title: string;
  body: string;
  priority?: NotificationPriorityKey | undefined;
  actionUrl?: string | null | undefined;
}

async function announcementRecipients(
  ctx: ServiceContext,
  input: CreateAnnouncementInput,
): Promise<string[]> {
  if (input.scope === "SCHOOL") {
    const users = await ctx.repositories.users.listBySchool(ctx.user.schoolId, {
      roles: ["TEACHER", "PARENT"],
      status: "ACTIVE",
    });
    return users.map((u) => u.id);
  }
  // SECTION — that section's parents + assigned teachers.
  if (!input.sectionId) {
    throw new ValidationError("A section announcement needs a sectionId");
  }
  const yearId = input.academicYearId ?? (await activeYearId(ctx));
  if (!yearId) {
    throw new ValidationError("No active academic year to resolve section recipients");
  }
  const [parentUserIds, assignments] = await Promise.all([
    parentUserIdsForSection(ctx.repositories, yearId, input.sectionId),
    ctx.repositories.teacherAssignments.list(ctx.user.schoolId, { sectionId: input.sectionId }),
  ]);
  return [...new Set([...parentUserIds, ...assignments.map((a) => a.teacherId)])];
}

/**
 * Admin composes + sends an ANNOUNCEMENT (M10 Step 6, ADR-018 §4). SCHOOL → every
 * ACTIVE parent + teacher; SECTION → that section's parents + assigned teachers.
 * Reuses the same `createBulkNotification` primitive as the publish events (one
 * Notification + N recipients + audit, atomic).
 */
export async function createAnnouncement(
  ctx: ServiceContext,
  input: CreateAnnouncementInput,
): Promise<CreateNotificationResult> {
  assertCan(ctx.user, PERMISSIONS.ANNOUNCEMENT_SEND);
  const userIds = await announcementRecipients(ctx, input);
  return createBulkNotification(ctx, {
    type: "ANNOUNCEMENT",
    priority: input.priority ?? "NORMAL",
    title: input.title,
    body: input.body,
    actionUrl: input.actionUrl ?? null,
    userIds,
  });
}
