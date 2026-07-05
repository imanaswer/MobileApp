import { ForbiddenError, NotFoundError } from "@repo/core";
import type { Student } from "@repo/db";

import type { ServiceContext } from "../../context";

/** JSON-safe changed-field bag for audit before/after. */
export type AuditFields = Record<string, string | number | boolean | null>;

/** SUPER_ADMIN / OFFICE_ADMIN have unrestricted (school-wide) People access. */
export function isFullAccess(ctx: ServiceContext): boolean {
  return ctx.user.role === "SUPER_ADMIN" || ctx.user.role === "OFFICE_ADMIN";
}

/** Load a student, enforcing tenant ownership (404 if missing or other-school). */
export async function loadStudentInSchool(ctx: ServiceContext, id: string): Promise<Student> {
  const student = await ctx.repositories.students.findById(id);
  if (!student || student.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Student not found");
  }
  return student;
}

/** Section ids the acting teacher teaches (via their TeacherAssignment rows). */
export async function teacherSectionIds(ctx: ServiceContext): Promise<string[]> {
  const rows = await ctx.repositories.teacherAssignments.list(ctx.user.schoolId, {
    teacherId: ctx.user.userId,
  });
  return [...new Set(rows.map((r) => r.sectionId))];
}

/** The active academic year id for the school, or null if none is active. */
async function activeYearId(ctx: ServiceContext): Promise<string | null> {
  const year = await ctx.repositories.academicYears.findActive(ctx.user.schoolId);
  return year?.id ?? null;
}

/** Student ids a PARENT actor is linked to (their children); [] if not a parent. */
export async function parentChildIds(ctx: ServiceContext): Promise<string[]> {
  const parent = await ctx.repositories.parents.findByUserId(ctx.user.userId);
  if (!parent) {
    return [];
  }
  return ctx.repositories.studentParents.studentIdsForParent(parent.id);
}

/**
 * Student ids the actor may read: "ALL" for admins, else the scoped id set —
 * teacher → students enrolled in their sections in the ACTIVE year; parent →
 * their children. Used by list endpoints.
 */
export async function accessibleStudentIds(ctx: ServiceContext): Promise<"ALL" | string[]> {
  if (isFullAccess(ctx)) {
    return "ALL";
  }
  if (ctx.user.role === "TEACHER") {
    const sectionIds = await teacherSectionIds(ctx);
    const yearId = await activeYearId(ctx);
    if (sectionIds.length === 0 || !yearId) {
      return [];
    }
    return ctx.repositories.enrollments.studentIdsInSections(sectionIds, yearId);
  }
  if (ctx.user.role === "PARENT") {
    return parentChildIds(ctx);
  }
  return [];
}

/** Throw ForbiddenError unless the actor may access this (already tenant-checked) student. */
export async function assertStudentInScope(ctx: ServiceContext, student: Student): Promise<void> {
  if (isFullAccess(ctx)) {
    return;
  }
  const ids = await accessibleStudentIds(ctx);
  if (ids !== "ALL" && ids.includes(student.id)) {
    return;
  }
  throw new ForbiddenError("Out of scope for this student");
}

/** Write an AuditLog row within the mutation's transaction (ADR-007). */
export function recordAudit(
  ctx: ServiceContext,
  repos: ServiceContext["repositories"],
  params: {
    action: string;
    entityType: string;
    entityId: string;
    before?: AuditFields;
    after?: AuditFields;
  },
): Promise<void> {
  return repos.audit.record({
    schoolId: ctx.user.schoolId,
    actorUserId: ctx.user.userId,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    ...(params.before ? { before: params.before } : {}),
    ...(params.after ? { after: params.after } : {}),
  });
}
