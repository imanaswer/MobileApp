import { PERMISSIONS } from "@repo/constants";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@repo/core";
import type { ClassTeacherAssignmentDto } from "@repo/types";

import { assertCan } from "../../authorization";
import type { ServiceContext } from "../../context";

import { mapClassTeacherAssignment } from "./mappers";

/**
 * Class-teacher management (M6.5, ADR-015). `ClassTeacherAssignment` is the
 * CURRENT holder of the class-teacher slot for (academicYear × section) — keyed
 * independent of what subjects the teacher teaches (so it is NOT a flag on
 * TeacherAssignment). Exactly ONE row per (year, section): a replacement is an
 * in-place `update` (ADR-010 §5 within-year mutation), never a second row, with
 * AuditLog carrying the change history. Management is admin-only under
 * `academic:manage`; the remark-authoring gate is the
 * {@link assertClassTeacherOfEnrollment} scope predicate the ReportCard step consumes.
 */

export interface AssignClassTeacherInput {
  academicYearId: string;
  sectionId: string;
  teacherId: string;
}

export interface ClassTeacherLookup {
  academicYearId: string;
  sectionId: string;
}

/**
 * Assign the class teacher of a section for a year. Admin-only. Rules: teacher is
 * an ACTIVE TEACHER in this school; the section and year exist in this school;
 * the (year, section) slot is not already taken (an occupied slot uses `replace`).
 * `assignedAt` defaults to now() (the current teacher's start); `createdByStaffId`
 * is the acting admin's Staff row (B3).
 */
export async function assignClassTeacher(
  ctx: ServiceContext,
  input: AssignClassTeacherInput,
): Promise<ClassTeacherAssignmentDto> {
  assertCan(ctx.user, PERMISSIONS.ACADEMIC_MANAGE);
  await assertIsActiveTeacher(ctx, input.teacherId);
  await assertSectionInSchool(ctx, input.sectionId);
  await assertYearInSchool(ctx, input.academicYearId);
  const createdByStaffId = await resolveActingStaffId(ctx);

  const existing = await ctx.repositories.classTeacherAssignments.findBySectionYear(
    input.academicYearId,
    input.sectionId,
  );
  if (existing) {
    throw new ConflictError("This section already has a class teacher for this year");
  }

  return ctx.withTransaction(async (repos) => {
    const created = await repos.classTeacherAssignments.create({
      schoolId: ctx.user.schoolId,
      academicYearId: input.academicYearId,
      sectionId: input.sectionId,
      teacherId: input.teacherId,
      createdByStaffId,
    });
    await repos.audit.record({
      schoolId: ctx.user.schoolId,
      actorUserId: ctx.user.userId,
      action: "CLASS_TEACHER_ASSIGN",
      entityType: "ClassTeacherAssignment",
      entityId: created.id,
      after: {
        academicYearId: created.academicYearId,
        sectionId: created.sectionId,
        teacherId: created.teacherId,
        assignedAt: created.assignedAt.toISOString(),
      },
    });
    return mapClassTeacherAssignment(created, await resolveTeacherName(ctx, created.teacherId));
  });
}

/**
 * Replace the class teacher of an already-assigned (year, section) slot — an
 * IN-PLACE update of the single row (ADR-015): `teacherId` = new teacher,
 * `assignedAt` = now() (the new holder's start; the prior value is preserved in
 * the AuditLog before-image), `createdByStaffId` = acting staff. Exactly ONE
 * `CLASS_TEACHER_REPLACE` audit row (before/after teacherId + assignedAt); NO
 * delete, NO insert, NO second row. Admin-only.
 */
export async function replaceClassTeacher(
  ctx: ServiceContext,
  input: AssignClassTeacherInput,
): Promise<ClassTeacherAssignmentDto> {
  assertCan(ctx.user, PERMISSIONS.ACADEMIC_MANAGE);
  await assertIsActiveTeacher(ctx, input.teacherId);
  const createdByStaffId = await resolveActingStaffId(ctx);

  const existing = await ctx.repositories.classTeacherAssignments.findBySectionYear(
    input.academicYearId,
    input.sectionId,
  );
  if (!existing || existing.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("No class teacher assigned for this section and year to replace");
  }

  const before = { teacherId: existing.teacherId, assignedAt: existing.assignedAt };
  const assignedAt = new Date(); // re-stamp: assignedAt = when the CURRENT (new) teacher took the slot

  return ctx.withTransaction(async (repos) => {
    const updated = await repos.classTeacherAssignments.update(existing.id, {
      teacherId: input.teacherId,
      assignedAt,
      createdByStaffId,
    });
    await repos.audit.record({
      schoolId: ctx.user.schoolId,
      actorUserId: ctx.user.userId,
      action: "CLASS_TEACHER_REPLACE",
      entityType: "ClassTeacherAssignment",
      entityId: updated.id,
      before: {
        teacherId: before.teacherId,
        assignedAt: before.assignedAt.toISOString(),
      },
      after: {
        teacherId: updated.teacherId,
        assignedAt: updated.assignedAt.toISOString(),
      },
    });
    return mapClassTeacherAssignment(updated, await resolveTeacherName(ctx, updated.teacherId));
  });
}

/** Remove a class-teacher assignment (frees the slot). Admin-only, audited. */
export async function removeClassTeacher(ctx: ServiceContext, id: string): Promise<void> {
  assertCan(ctx.user, PERMISSIONS.ACADEMIC_MANAGE);
  const before = await loadAssignment(ctx, id);
  await ctx.withTransaction(async (repos) => {
    await repos.classTeacherAssignments.delete(id);
    await repos.audit.record({
      schoolId: ctx.user.schoolId,
      actorUserId: ctx.user.userId,
      action: "CLASS_TEACHER_REMOVE",
      entityType: "ClassTeacherAssignment",
      entityId: id,
      before: {
        academicYearId: before.academicYearId,
        sectionId: before.sectionId,
        teacherId: before.teacherId,
      },
    });
  });
}

/** The class teacher of a section for a year, or null. Any academic reader. */
export async function getClassTeacherForSection(
  ctx: ServiceContext,
  lookup: ClassTeacherLookup,
): Promise<ClassTeacherAssignmentDto | null> {
  assertCan(ctx.user, PERMISSIONS.ACADEMIC_READ);
  const row = await ctx.repositories.classTeacherAssignments.findBySectionYear(
    lookup.academicYearId,
    lookup.sectionId,
  );
  if (!row || row.schoolId !== ctx.user.schoolId) {
    return null;
  }
  return mapClassTeacherAssignment(row, await resolveTeacherName(ctx, row.teacherId));
}

/**
 * SCOPE PREDICATE — is the acting principal the class teacher of this
 * enrollment's section, for this enrollment's year? This is the load-bearing
 * gate the report-card remark mutation will call: only the assigned class
 * teacher may author teacher remarks (a subject teacher of the section, or any
 * other teacher, resolves false). Returns false for an unplaced enrollment
 * (no section) and for a section with no class teacher.
 */
export async function isClassTeacherOfEnrollment(
  ctx: ServiceContext,
  enrollmentId: string,
): Promise<boolean> {
  const enrollment = await ctx.repositories.enrollments.findById(enrollmentId);
  if (!enrollment || enrollment.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Enrollment not found");
  }
  if (!enrollment.sectionId) {
    return false; // ADMITTED before placement — no section, so no class teacher
  }
  const classTeacher = await ctx.repositories.classTeacherAssignments.findBySectionYear(
    enrollment.academicYearId,
    enrollment.sectionId,
  );
  return classTeacher?.teacherId === ctx.user.userId;
}

/**
 * Enforce {@link isClassTeacherOfEnrollment}; throws ForbiddenError otherwise.
 * The report-card step calls this before accepting a teacher remark.
 */
export async function assertClassTeacherOfEnrollment(
  ctx: ServiceContext,
  enrollmentId: string,
): Promise<void> {
  if (!(await isClassTeacherOfEnrollment(ctx, enrollmentId))) {
    throw new ForbiddenError("Only the assigned class teacher may author report-card remarks");
  }
}

/* ---- validation helpers (mirror teacher-assignment.service) ---- */

async function loadAssignment(ctx: ServiceContext, id: string) {
  const row = await ctx.repositories.classTeacherAssignments.findById(id);
  if (!row || row.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Class-teacher assignment not found");
  }
  return row;
}

async function assertIsActiveTeacher(ctx: ServiceContext, teacherId: string): Promise<void> {
  const user = await ctx.repositories.users.findById(teacherId);
  if (!user || user.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Teacher not found");
  }
  if (user.role !== "TEACHER" || user.status !== "ACTIVE") {
    throw new ValidationError("Class teacher must be an active teacher");
  }
}

async function assertSectionInSchool(ctx: ServiceContext, sectionId: string): Promise<void> {
  const section = await ctx.repositories.sections.findById(sectionId);
  if (!section) {
    throw new NotFoundError("Section not found");
  }
  const cls = await ctx.repositories.classes.findById(section.classId);
  if (!cls || cls.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Section not found");
  }
}

async function assertYearInSchool(ctx: ServiceContext, academicYearId: string): Promise<void> {
  const year = await ctx.repositories.academicYears.findById(academicYearId);
  if (!year || year.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Academic year not found");
  }
}

/**
 * Display name of a teacher (Staff.name via their userId; ADR-016). A teacher always
 * has a Staff row (B3) and Staff.name is required post-M8; the fallback covers the
 * impossible no-profile case with a stable, non-cuid string.
 */
async function resolveTeacherName(ctx: ServiceContext, userId: string): Promise<string> {
  const staff = await ctx.repositories.staff.findByUserId(userId);
  return staff?.name ?? "Unknown teacher";
}

/**
 * The acting user's Staff row id (B3 provisioning invariant — mirrors the exam /
 * homework resolvers). Every class-teacher assignment records WHO assigned it; a
 * user without a Staff row is a provisioning error surfaced as a clean error.
 */
async function resolveActingStaffId(ctx: ServiceContext): Promise<string> {
  const staff = await ctx.repositories.staff.findByUserId(ctx.user.userId);
  if (!staff) {
    throw new ValidationError(
      "Acting user has no staff profile (required to assign a class teacher)",
    );
  }
  return staff.id;
}
