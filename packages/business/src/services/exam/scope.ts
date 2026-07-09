import { ForbiddenError, NotFoundError, ValidationError } from "@repo/core";
import type {
  Assessment,
  Enrollment,
  Exam,
  ExamSection,
  GradeScaleWithBands,
  Mark,
} from "@repo/db";
import type {
  AssessmentDto,
  ExamDto,
  ExamSectionDto,
  GradeScaleDto,
  IsoUtcString,
  IstDateString,
  MarkDto,
} from "@repo/types";

import type { ServiceContext } from "../../context";
import { isFullAccess, parentChildIds, teacherSectionIds } from "../people/scope";

export { recordAudit } from "../people/scope";

/** True when the acting user is a PARENT (published-only read scope). */
export function isParent(ctx: ServiceContext): boolean {
  return ctx.user.role === "PARENT";
}

const istDate = (d: Date | null): IstDateString | null =>
  d ? (d.toISOString().slice(0, 10) as IstDateString) : null;
const iso = (d: Date | null): IsoUtcString | null => (d ? (d.toISOString() as IsoUtcString) : null);

/**
 * The acting user's Staff row id (B3 provisioning invariant — mirrors the
 * attendance resolver). Every exam mutation is authored by a Staff row; a user
 * without one is a provisioning error surfaced as a clean ValidationError.
 */
export async function resolveActingStaffId(ctx: ServiceContext): Promise<string> {
  const staff = await ctx.repositories.staff.findByUserId(ctx.user.userId);
  if (!staff) {
    throw new ValidationError("Acting user has no staff profile (required for exam actions)");
  }
  return staff.id;
}

export async function loadExamInSchool(ctx: ServiceContext, id: string): Promise<Exam> {
  const row = await ctx.repositories.exams.findById(id);
  if (!row || row.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Exam not found");
  }
  return row;
}

export async function loadAssessmentInSchool(ctx: ServiceContext, id: string): Promise<Assessment> {
  const row = await ctx.repositories.assessments.findById(id);
  if (!row || row.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Assessment not found");
  }
  return row;
}

export async function loadExamSectionInSchool(
  ctx: ServiceContext,
  id: string,
): Promise<ExamSection> {
  const row = await ctx.repositories.examSections.findById(id);
  if (!row || row.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Exam section not found");
  }
  return row;
}

/**
 * Teacher ownership (ADR-012 §9): admin → any; teacher → must hold a
 * TeacherAssignment for exactly this (subject, section); anyone else → Forbidden.
 * Ownership is DERIVED here, never stored.
 */
export async function assertOwnsAssessmentSection(
  ctx: ServiceContext,
  subjectId: string,
  sectionId: string,
): Promise<void> {
  if (isFullAccess(ctx)) {
    return;
  }
  if (ctx.user.role === "TEACHER") {
    const owned = await ctx.repositories.teacherAssignments.findByTriple(
      ctx.user.userId,
      subjectId,
      sectionId,
    );
    if (owned) {
      return;
    }
  }
  throw new ForbiddenError("Out of scope for this assessment/section");
}

export async function loadEnrollmentInSchool(ctx: ServiceContext, id: string): Promise<Enrollment> {
  const row = await ctx.repositories.enrollments.findById(id);
  if (!row || row.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Enrollment not found");
  }
  return row;
}

/**
 * Read scope for one enrollment's marks/GPA (ADR-012 §4): admin → any; teacher →
 * the enrollment's section is one they teach; parent → the enrollment's student is
 * their child. Parents are additionally limited to PUBLISHED+LOCKED marks at the
 * query (see MarkService/GradeService), so this only gates the enrollment itself.
 */
export async function assertEnrollmentReadScope(
  ctx: ServiceContext,
  enrollment: Enrollment,
): Promise<void> {
  if (isFullAccess(ctx)) {
    return;
  }
  if (ctx.user.role === "TEACHER") {
    if (enrollment.sectionId && (await teacherSectionIds(ctx)).includes(enrollment.sectionId)) {
      return;
    }
  } else if (ctx.user.role === "PARENT") {
    if ((await parentChildIds(ctx)).includes(enrollment.studentId)) {
      return;
    }
  }
  throw new ForbiddenError("Out of scope for this enrollment");
}

/* ---- mappers ---- */

export function mapExam(e: Exam): ExamDto {
  return {
    id: e.id,
    schoolId: e.schoolId,
    academicYearId: e.academicYearId,
    gradeScaleId: e.gradeScaleId,
    name: e.name,
    type: e.type,
    displayOrder: e.displayOrder,
    startDate: istDate(e.startDate),
    endDate: istDate(e.endDate),
    isPublished: e.isPublished,
    publishedAt: iso(e.publishedAt),
    publishedByStaffId: e.publishedByStaffId,
  };
}

export function mapAssessment(a: Assessment): AssessmentDto {
  return {
    id: a.id,
    schoolId: a.schoolId,
    examId: a.examId,
    subjectId: a.subjectId,
    maxTheory: a.maxTheory,
    maxPractical: a.maxPractical,
    passMark: a.passMark,
    displayOrder: a.displayOrder,
  };
}

export function mapExamSection(s: ExamSection): ExamSectionDto {
  return {
    id: s.id,
    schoolId: s.schoolId,
    assessmentId: s.assessmentId,
    sectionId: s.sectionId,
    status: s.status,
    createdByStaffId: s.createdByStaffId,
    submittedByStaffId: s.submittedByStaffId,
    lockedByStaffId: s.lockedByStaffId,
    submittedAt: iso(s.submittedAt),
    lockedAt: iso(s.lockedAt),
    unlockedByStaffId: s.unlockedByStaffId,
    unlockedAt: iso(s.unlockedAt),
    unlockReason: s.unlockReason,
  };
}

export function mapMark(m: Mark): MarkDto {
  return {
    id: m.id,
    schoolId: m.schoolId,
    examSectionId: m.examSectionId,
    assessmentId: m.assessmentId,
    enrollmentId: m.enrollmentId,
    theoryObtained: m.theoryObtained,
    practicalObtained: m.practicalObtained,
    isAbsent: m.isAbsent,
    totalObtained: m.totalObtained,
    percentage: m.percentage,
    gradeBandId: m.gradeBandId,
    gradeLetter: m.gradeLetterSnapshot,
    gradePoint: m.gradePointSnapshot,
    subjectName: null,
    examName: null,
  };
}

export function mapGradeScale(g: GradeScaleWithBands): GradeScaleDto {
  return {
    id: g.id,
    schoolId: g.schoolId,
    name: g.name,
    isDefault: g.isDefault,
    bands: g.bands.map((b) => ({
      id: b.id,
      grade: b.grade,
      minPercent: b.minPercent,
      maxPercent: b.maxPercent,
      gradePoint: b.gradePoint,
    })),
  };
}
