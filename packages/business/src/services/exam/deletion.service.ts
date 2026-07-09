import { PERMISSIONS } from "@repo/constants";
import { ConflictError, NotFoundError } from "@repo/core";
import type { ExamDeletionRef } from "@repo/db";

import { assertCan } from "../../authorization";
import type { ServiceContext } from "../../context";
import { recordAudit } from "../people/scope";

/**
 * M5 published-data DELETION GUARD (ADR-012 R5).
 *
 * The definition chain Exam → Assessment → ExamSection → Mark is all `onDelete:
 * Cascade`, and the database CANNOT tell a published/locked exam from a draft — so
 * a delete reaching a published exam WOULD cascade-wipe published results. The only
 * protection is this business-layer guard, and EVERY delete entry point
 * (exam/assessment/exam-section) routes through the SAME canonical check
 * {@link assertExamDeletable} so none can become a bypass path.
 *
 * A delete is refused when the owning exam is published OR any of its sections is
 * LOCKED. Rejections throw BEFORE the transaction opens, so no audit row is
 * written; a successful delete writes exactly one audit row inside the same
 * transaction as the delete.
 *
 * (Step 5 adds the rest of ExamService — create/update/publish/lock; this deletion
 * surface is implemented early to close R5. The `exam:manage` permission gate is
 * admin-only per PERMISSIONS_MATRIX.)
 */

/** THE canonical guard. Throws `ConflictError` if the owning exam's data is
 *  protected (published, or any section LOCKED). Returns the ref on success. */
async function assertExamDeletable(
  ctx: ServiceContext,
  ref: ExamDeletionRef,
): Promise<ExamDeletionRef> {
  if (ref.isPublished) {
    throw new ConflictError("Cannot delete a published exam's data");
  }
  if (await ctx.repositories.exams.hasLockedSection(ref.examId)) {
    throw new ConflictError("Cannot delete an exam with a locked section");
  }
  return ref;
}

/** Resolve a ref (in the caller's school) or throw NotFound — never leak across schools. */
function inSchool(
  ctx: ServiceContext,
  ref: ExamDeletionRef | null,
  label: string,
): ExamDeletionRef {
  if (!ref || ref.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError(`${label} not found`);
  }
  return ref;
}

/** Delete an exam (cascades assessments/sections/marks) — guarded + audited. */
export async function deleteExam(ctx: ServiceContext, examId: string): Promise<void> {
  assertCan(ctx.user, PERMISSIONS.EXAM_MANAGE);
  const ref = inSchool(ctx, await ctx.repositories.exams.findDeletionRefById(examId), "Exam");
  await assertExamDeletable(ctx, ref);
  await ctx.withTransaction(async (repos) => {
    await repos.exams.deleteExam(examId);
    await recordAudit(ctx, repos, { action: "EXAM_DELETE", entityType: "Exam", entityId: examId });
  });
}

/** Delete an assessment — routed through the SAME exam guard so it cannot bypass it. */
export async function deleteAssessment(ctx: ServiceContext, assessmentId: string): Promise<void> {
  assertCan(ctx.user, PERMISSIONS.EXAM_MANAGE);
  const ref = inSchool(
    ctx,
    await ctx.repositories.exams.findDeletionRefByAssessment(assessmentId),
    "Assessment",
  );
  await assertExamDeletable(ctx, ref);
  await ctx.withTransaction(async (repos) => {
    await repos.exams.deleteAssessment(assessmentId);
    await recordAudit(ctx, repos, {
      action: "ASSESSMENT_DELETE",
      entityType: "Assessment",
      entityId: assessmentId,
    });
  });
}

/** Delete an exam-section — routed through the SAME exam guard so it cannot bypass it. */
export async function deleteExamSection(ctx: ServiceContext, examSectionId: string): Promise<void> {
  assertCan(ctx.user, PERMISSIONS.EXAM_MANAGE);
  const ref = inSchool(
    ctx,
    await ctx.repositories.exams.findDeletionRefByExamSection(examSectionId),
    "Exam section",
  );
  await assertExamDeletable(ctx, ref);
  await ctx.withTransaction(async (repos) => {
    await repos.exams.deleteExamSection(examSectionId);
    await recordAudit(ctx, repos, {
      action: "EXAM_SECTION_DELETE",
      entityType: "ExamSection",
      entityId: examSectionId,
    });
  });
}
