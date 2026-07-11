import { PERMISSIONS } from "@repo/constants";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@repo/core";
import type { AcademicYear, Class, Enrollment, Section } from "@repo/db";
import type { EnrollmentDto, EnrollmentHistoryRowDto, EnrollmentRosterRowDto } from "@repo/types";

import { assertCan } from "../../authorization";
import type { ServiceContext } from "../../context";

import { mapEnrollment } from "./mappers";
import {
  assertStudentInScope,
  isFullAccess,
  loadStudentInSchool,
  recordAudit,
  teacherSectionIds,
} from "./scope";

export interface EnrollInput {
  studentId: string;
  academicYearId: string;
  classId: string;
  sectionId?: string | undefined;
  rollNo?: number | undefined;
}

export interface TransferInput {
  enrollmentId: string;
  toSectionId: string;
  rollNo?: number | undefined;
}

export interface PromoteInput {
  enrollmentId: string;
  targetAcademicYearId: string;
  toClassId: string;
  toSectionId?: string | undefined;
  rollNo?: number | undefined;
}

/** All enrollments (history) of a student, in scope. */
export async function listEnrollmentsByStudent(
  ctx: ServiceContext,
  studentId: string,
): Promise<EnrollmentHistoryRowDto[]> {
  assertCan(ctx.user, PERMISSIONS.ENROLLMENT_READ);
  const student = await loadStudentInSchool(ctx, studentId);
  await assertStudentInScope(ctx, student);
  const rows = await ctx.repositories.enrollments.listByStudent(studentId);
  // Class/section NAME join via repositories (NOT the academic service — that carries
  // assertCan(ACADEMIC_READ), which a parent lacks). Reading a label for a row the caller
  // already sees is a lookup, not an academic-structure grant (ADR-016, F5).
  const classes = await Promise.all(
    [...new Set(rows.map((r) => r.classId))].map((id) => ctx.repositories.classes.findById(id)),
  );
  const sections = await Promise.all(
    [...new Set(rows.map((r) => r.sectionId).filter((s): s is string => s !== null))].map((id) =>
      ctx.repositories.sections.findById(id),
    ),
  );
  const className = new Map(classes.filter((c) => c !== null).map((c) => [c.id, c.name]));
  const sectionName = new Map(sections.filter((s) => s !== null).map((s) => [s.id, s.name]));
  return rows.map((r) => ({
    ...mapEnrollment(r),
    className: className.get(r.classId) ?? "—",
    sectionName: r.sectionId ? (sectionName.get(r.sectionId) ?? null) : null,
  }));
}

/** Roster of a section for a year (admin any; teacher only sections they teach; parent none). */
export async function sectionRoster(
  ctx: ServiceContext,
  input: { academicYearId: string; sectionId: string },
): Promise<EnrollmentRosterRowDto[]> {
  assertCan(ctx.user, PERMISSIONS.ENROLLMENT_READ);
  if (!isFullAccess(ctx)) {
    if (ctx.user.role !== "TEACHER" || !(await teacherSectionIds(ctx)).includes(input.sectionId)) {
      throw new ForbiddenError("Out of scope for this section");
    }
  }
  const rows = await ctx.repositories.enrollments.listBySection(
    input.academicYearId,
    input.sectionId,
  );
  const students = await ctx.repositories.students.listByIds([
    ...new Set(rows.map((r) => r.studentId)),
  ]);
  const studentName = new Map(students.map((s) => [s.id, `${s.firstName} ${s.lastName}`.trim()]));
  return rows.map((r) => ({
    ...mapEnrollment(r),
    studentName: studentName.get(r.studentId) ?? "—",
  }));
}

/** Enroll a student for a year. Section optional → ADMITTED (unplaced) vs ACTIVE. */
export async function enroll(ctx: ServiceContext, input: EnrollInput): Promise<EnrollmentDto> {
  assertCan(ctx.user, PERMISSIONS.ENROLLMENT_MANAGE);

  const student = await loadStudentInSchool(ctx, input.studentId);
  if (student.status !== "ACTIVE") {
    throw new ValidationError(`Cannot enroll a ${student.status.toLowerCase()} student`);
  }
  await assertYearInSchool(ctx, input.academicYearId);
  await assertClassInSchool(ctx, input.classId);
  if (input.sectionId) {
    await assertSectionInClass(ctx, input.sectionId, input.classId);
  }
  assertRollNoNeedsSection(input.rollNo, input.sectionId);

  if (await ctx.repositories.enrollments.findByStudentYear(input.studentId, input.academicYearId)) {
    throw new ConflictError("This student is already enrolled for that academic year");
  }
  if (input.sectionId && input.rollNo != null) {
    await assertRollNoFree(ctx, input.academicYearId, input.sectionId, input.rollNo);
  }

  return ctx.withTransaction(async (repos) => {
    const created = await repos.enrollments.create({
      schoolId: ctx.user.schoolId,
      studentId: input.studentId,
      academicYearId: input.academicYearId,
      classId: input.classId,
      sectionId: input.sectionId ?? null,
      rollNo: input.rollNo ?? null,
      status: input.sectionId ? "ACTIVE" : "ADMITTED",
    });
    await recordAudit(ctx, repos, {
      action: "ENROLLMENT_CREATE",
      entityType: "Enrollment",
      entityId: created.id,
      after: {
        studentId: created.studentId,
        academicYearId: created.academicYearId,
        status: created.status,
      },
    });
    return mapEnrollment(created);
  });
}

/**
 * Section transfer within the SAME class/grade — in-place mutation of the same
 * row (ADR-010 §5), never a second row. A roll number without an explicit new
 * value is cleared (roll numbers are per-section).
 */
export async function transfer(ctx: ServiceContext, input: TransferInput): Promise<EnrollmentDto> {
  assertCan(ctx.user, PERMISSIONS.ENROLLMENT_MANAGE);
  const before = await loadEnrollment(ctx, input.enrollmentId);
  await assertSectionInClass(ctx, input.toSectionId, before.classId);

  if (input.rollNo != null) {
    await assertRollNoFree(ctx, before.academicYearId, input.toSectionId, input.rollNo, before.id);
  }

  return ctx.withTransaction(async (repos) => {
    const after = await repos.enrollments.update(before.id, {
      sectionId: input.toSectionId,
      rollNo: input.rollNo ?? null,
      status: "ACTIVE",
    });
    await recordAudit(ctx, repos, {
      action: "ENROLLMENT_TRANSFER",
      entityType: "Enrollment",
      entityId: before.id,
      before: { sectionId: before.sectionId, rollNo: before.rollNo },
      after: { sectionId: after.sectionId, rollNo: after.rollNo },
    });
    return mapEnrollment(after);
  });
}

/** Withdraw: current enrollment → DROPPED and the student → WITHDRAWN (one txn). */
export async function withdraw(ctx: ServiceContext, enrollmentId: string): Promise<EnrollmentDto> {
  assertCan(ctx.user, PERMISSIONS.ENROLLMENT_MANAGE);
  const before = await loadEnrollment(ctx, enrollmentId);
  const student = await loadStudentInSchool(ctx, before.studentId);

  return ctx.withTransaction(async (repos) => {
    const after = await repos.enrollments.update(before.id, { status: "DROPPED" });
    await repos.students.update(student.id, { status: "WITHDRAWN" });
    await recordAudit(ctx, repos, {
      action: "ENROLLMENT_WITHDRAW",
      entityType: "Enrollment",
      entityId: before.id,
      before: { status: before.status },
      after: { status: after.status },
    });
    await recordAudit(ctx, repos, {
      action: "STUDENT_WITHDRAW",
      entityType: "Student",
      entityId: student.id,
      before: { status: student.status },
      after: { status: "WITHDRAWN" },
    });
    return mapEnrollment(after);
  });
}

/**
 * Promote (or retain) into a NEW year: creates a fresh enrollment and marks the
 * source PROMOTED (moved up) or RETAINED (same class again). The source row is
 * never re-pointed (ADR-010 §4/§7).
 */
export async function promote(ctx: ServiceContext, input: PromoteInput): Promise<EnrollmentDto> {
  assertCan(ctx.user, PERMISSIONS.ENROLLMENT_MANAGE);
  const source = await loadEnrollment(ctx, input.enrollmentId);

  if (input.targetAcademicYearId === source.academicYearId) {
    throw new ValidationError("Promotion target must be a different academic year");
  }
  await assertYearInSchool(ctx, input.targetAcademicYearId);
  await assertClassInSchool(ctx, input.toClassId);
  if (input.toSectionId) {
    await assertSectionInClass(ctx, input.toSectionId, input.toClassId);
  }
  assertRollNoNeedsSection(input.rollNo, input.toSectionId);

  if (
    await ctx.repositories.enrollments.findByStudentYear(
      source.studentId,
      input.targetAcademicYearId,
    )
  ) {
    throw new ConflictError("This student already has an enrollment for the target year");
  }
  if (input.toSectionId && input.rollNo != null) {
    await assertRollNoFree(ctx, input.targetAcademicYearId, input.toSectionId, input.rollNo);
  }

  const sourceStatus = input.toClassId === source.classId ? "RETAINED" : "PROMOTED";

  return ctx.withTransaction(async (repos) => {
    const created = await repos.enrollments.create({
      schoolId: ctx.user.schoolId,
      studentId: source.studentId,
      academicYearId: input.targetAcademicYearId,
      classId: input.toClassId,
      sectionId: input.toSectionId ?? null,
      rollNo: input.toSectionId ? (input.rollNo ?? null) : null,
      status: input.toSectionId ? "ACTIVE" : "ADMITTED",
    });
    await repos.enrollments.update(source.id, { status: sourceStatus });
    await recordAudit(ctx, repos, {
      action: sourceStatus === "RETAINED" ? "ENROLLMENT_RETAIN" : "ENROLLMENT_PROMOTE",
      entityType: "Enrollment",
      entityId: created.id,
      before: { sourceEnrollmentId: source.id, sourceStatus: source.status },
      after: {
        academicYearId: created.academicYearId,
        classId: created.classId,
        status: created.status,
      },
    });
    return mapEnrollment(created);
  });
}

/* ---- internal loaders / validators ---- */

async function loadEnrollment(ctx: ServiceContext, id: string): Promise<Enrollment> {
  const row = await ctx.repositories.enrollments.findById(id);
  if (!row || row.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Enrollment not found");
  }
  return row;
}

async function assertYearInSchool(ctx: ServiceContext, id: string): Promise<AcademicYear> {
  const year = await ctx.repositories.academicYears.findById(id);
  if (!year || year.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Academic year not found");
  }
  return year;
}

async function assertClassInSchool(ctx: ServiceContext, id: string): Promise<Class> {
  const klass = await ctx.repositories.classes.findById(id);
  if (!klass || klass.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Class not found");
  }
  return klass;
}

/** The section must exist and belong to the given class (keeps placement consistent). */
async function assertSectionInClass(
  ctx: ServiceContext,
  sectionId: string,
  classId: string,
): Promise<Section> {
  const section = await ctx.repositories.sections.findById(sectionId);
  if (!section) {
    throw new NotFoundError("Section not found");
  }
  if (section.classId !== classId) {
    throw new ValidationError("Section does not belong to that class");
  }
  return section;
}

function assertRollNoNeedsSection(rollNo?: number, sectionId?: string): void {
  if (rollNo != null && !sectionId) {
    throw new ValidationError("A roll number can only be set once a section is assigned");
  }
}

async function assertRollNoFree(
  ctx: ServiceContext,
  academicYearId: string,
  sectionId: string,
  rollNo: number,
  excludeId?: string,
): Promise<void> {
  const clash = await ctx.repositories.enrollments.findRollNoConflict(
    academicYearId,
    sectionId,
    rollNo,
    excludeId,
  );
  if (clash) {
    throw new ConflictError(`Roll number ${rollNo} is already taken in that section`);
  }
}
