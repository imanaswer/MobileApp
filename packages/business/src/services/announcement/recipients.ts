import type { RoleKey } from "@repo/constants";
import type { AnnouncementWithAttachments } from "@repo/db";

import type { ServiceContext } from "../../context";
import { parentUserIdsForSection } from "../notification/recipients";

/**
 * Resolve an announcement's notification recipients from its scope (ADR-019 §5) —
 * reusing the M10 enrollment/assignment recipient helpers. Login-user ids, de-duped.
 * Called AFTER publish commits (best-effort); no auth (the publish was the gate).
 */
async function usersBySchool(ctx: ServiceContext, roles: RoleKey[]): Promise<string[]> {
  const users = await ctx.repositories.users.listBySchool(ctx.user.schoolId, {
    roles,
    status: "ACTIVE",
  });
  return users.map((u) => u.id);
}

async function sectionRecipients(
  ctx: ServiceContext,
  academicYearId: string,
  sectionId: string,
): Promise<string[]> {
  const [parentUserIds, assignments] = await Promise.all([
    parentUserIdsForSection(ctx.repositories, academicYearId, sectionId),
    ctx.repositories.teacherAssignments.list(ctx.user.schoolId, { sectionId }),
  ]);
  return [...parentUserIds, ...assignments.map((a) => a.teacherId)];
}

export async function resolveAnnouncementRecipients(
  ctx: ServiceContext,
  a: AnnouncementWithAttachments,
): Promise<string[]> {
  switch (a.scope) {
    case "WHOLE_SCHOOL":
      return usersBySchool(ctx, ["TEACHER", "PARENT"]);
    case "TEACHERS":
      return usersBySchool(ctx, ["TEACHER"]);
    case "PARENTS":
      return usersBySchool(ctx, ["PARENT"]);
    case "SECTION":
      return a.targetId ? sectionRecipients(ctx, a.academicYearId, a.targetId) : [];
    case "CLASS": {
      if (!a.targetId) return [];
      const sections = await ctx.repositories.sections.listByClass(a.targetId);
      const perSection = await Promise.all(
        sections.map((s) => sectionRecipients(ctx, a.academicYearId, s.id)),
      );
      return [...new Set(perSection.flat())];
    }
    default:
      return [];
  }
}
