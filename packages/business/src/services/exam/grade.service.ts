import { PERMISSIONS } from "@repo/constants";
import { computeGpa, ValidationError, type GradeBandInput } from "@repo/core";
import type { Exam } from "@repo/db";

import { assertCan } from "../../authorization";
import type { ServiceContext } from "../../context";

import { assertEnrollmentReadScope, isParent, loadEnrollmentInSchool } from "./scope";

/**
 * Resolve the grade bands for an exam (ADR-012 §3): the exam's own scale, else the
 * school's default scale. Throws if none resolvable — LOCK cannot snapshot a grade
 * without a scale. Used only by MarkService.lockRegister (grade compute is central).
 */
export async function resolveBandsForExam(
  ctx: ServiceContext,
  exam: Exam,
): Promise<GradeBandInput[]> {
  const scale = exam.gradeScaleId
    ? await ctx.repositories.gradeScales.findByIdWithBands(exam.gradeScaleId)
    : await ctx.repositories.gradeScales.findDefaultWithBands(ctx.user.schoolId);
  if (!scale || scale.bands.length === 0) {
    throw new ValidationError("No grade scale is configured for this exam; cannot lock");
  }
  return scale.bands.map((b) => ({
    id: b.id,
    grade: b.grade,
    minPercent: b.minPercent,
    maxPercent: b.maxPercent,
    gradePoint: b.gradePoint,
  }));
}

/**
 * Enrollment GPA from Mark SNAPSHOTS only (ADR-012 §4) — never recomputed from the
 * current scale. Draft marks (no snapshot) are excluded automatically; a scale
 * without points yields null ("not available"). Parents see only published+locked
 * marks; staff see all snapshots. This is the CGPA building block (aggregate a
 * student's enrollments — see ADR-010 §8).
 */
export async function gpaForEnrollment(
  ctx: ServiceContext,
  enrollmentId: string,
): Promise<number | null> {
  assertCan(ctx.user, PERMISSIONS.MARK_READ);
  const enrollment = await loadEnrollmentInSchool(ctx, enrollmentId);
  await assertEnrollmentReadScope(ctx, enrollment);
  const marks = isParent(ctx)
    ? await ctx.repositories.marks.listPublishedByEnrollment(enrollmentId)
    : await ctx.repositories.marks.listByEnrollment(enrollmentId);
  return computeGpa(marks.map((m) => m.gradePointSnapshot));
}
