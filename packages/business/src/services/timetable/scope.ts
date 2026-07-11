import { ForbiddenError, NotFoundError, ValidationError } from "@repo/core";
import type { BellSchedule, Enrollment, Period, TimetableEntry } from "@repo/db";

import type { ServiceContext } from "../../context";
import { isFullAccess, parentChildIds } from "../people/scope";

export { isFullAccess };

/* ---- in-school loaders (tenant guard; ADR-008) ---- */

export async function loadBellScheduleInSchool(
  ctx: ServiceContext,
  id: string,
): Promise<BellSchedule> {
  const row = await ctx.repositories.bellSchedules.findById(id);
  if (!row || row.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Bell schedule not found");
  }
  return row;
}

export async function loadPeriodInSchool(ctx: ServiceContext, id: string): Promise<Period> {
  const row = await ctx.repositories.periods.findById(id);
  if (!row || row.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Period not found");
  }
  return row;
}

export async function loadEntryInSchool(ctx: ServiceContext, id: string): Promise<TimetableEntry> {
  const row = await ctx.repositories.timetableEntries.findById(id);
  if (!row || row.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Timetable entry not found");
  }
  return row;
}

export async function assertYearInSchool(
  ctx: ServiceContext,
  academicYearId: string,
): Promise<void> {
  const year = await ctx.repositories.academicYears.findById(academicYearId);
  if (!year || year.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Academic year not found");
  }
}

export async function assertSectionInSchool(ctx: ServiceContext, sectionId: string): Promise<void> {
  const section = await ctx.repositories.sections.findById(sectionId);
  if (!section) {
    throw new NotFoundError("Section not found");
  }
  const cls = await ctx.repositories.classes.findById(section.classId);
  if (!cls || cls.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Section not found");
  }
}

export async function assertSubjectInSchool(ctx: ServiceContext, subjectId: string): Promise<void> {
  const subject = await ctx.repositories.subjects.findById(subjectId);
  if (!subject || subject.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Subject not found");
  }
}

/**
 * OWNERSHIP (ADR-017): the named teacher must actually teach this subject in this
 * section — derived from a `TeacherAssignment(teacher, subject, section)`, NEVER
 * from `ClassTeacherAssignment`. This is a data-integrity rule on the entry the
 * (admin) caller is creating, so a missing assignment is a ValidationError, not a
 * caller-scope Forbidden.
 */
export async function assertTeacherAssignedToSubjectSection(
  ctx: ServiceContext,
  teacherId: string,
  subjectId: string,
  sectionId: string,
): Promise<void> {
  const assignment = await ctx.repositories.teacherAssignments.findByTriple(
    teacherId,
    subjectId,
    sectionId,
  );
  if (!assignment || assignment.schoolId !== ctx.user.schoolId) {
    throw new ValidationError(
      "The teacher is not assigned to this subject in this section (add a teacher assignment first)",
    );
  }
}

/** A parent's own children's ACTIVE enrollments in a given year (section-timetable source). */
export async function parentActiveEnrollmentsInYear(
  ctx: ServiceContext,
  academicYearId: string,
): Promise<Enrollment[]> {
  const childIds = await parentChildIds(ctx);
  const perChild = await Promise.all(
    childIds.map((sid) => ctx.repositories.enrollments.listByStudent(sid)),
  );
  return perChild
    .flat()
    .filter((e) => e.academicYearId === academicYearId && e.status === "ACTIVE" && !!e.sectionId);
}

/** Whether one of the parent's children is ACTIVE in `sectionId` this year. */
export async function parentOwnsSection(
  ctx: ServiceContext,
  academicYearId: string,
  sectionId: string,
): Promise<boolean> {
  const enrollments = await parentActiveEnrollmentsInYear(ctx, academicYearId);
  return enrollments.some((e) => e.sectionId === sectionId);
}

/**
 * Read scope for a SECTION grid: admin → any section; parent → only a section one
 * of their children is ACTIVE in this year; teacher → refused here (a teacher reads
 * their OWN slots via the teacher view, ADR-017 §3, never the full section grid).
 */
export async function assertSectionReadScope(
  ctx: ServiceContext,
  academicYearId: string,
  sectionId: string,
): Promise<void> {
  if (isFullAccess(ctx)) {
    return;
  }
  if (ctx.user.role === "PARENT" && (await parentOwnsSection(ctx, academicYearId, sectionId))) {
    return;
  }
  throw new ForbiddenError("Out of scope for this section's timetable");
}
