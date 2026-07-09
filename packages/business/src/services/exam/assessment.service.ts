import { PERMISSIONS } from "@repo/constants";
import { ConflictError, NotFoundError, ValidationError } from "@repo/core";
import type { AssessmentDto } from "@repo/types";

import { assertCan } from "../../authorization";
import type { ServiceContext } from "../../context";

import { loadExamInSchool, mapAssessment, recordAudit } from "./scope";

export interface CreateAssessmentInput {
  examId: string;
  subjectId: string;
  maxTheory: number;
  maxPractical?: number | null | undefined;
  passMark: number;
  displayOrder?: number | undefined;
}

/**
 * Create an assessment (Exam × Subject) — admin. Validates the exam is in-school
 * and unpublished, the subject is in-school, and the mark limits are coherent
 * (mirrors the DB CHECK for a friendly message). Cross-year integrity is enforced
 * later at the mark boundary (ADR-012 §10). Audited.
 */
export async function createAssessment(
  ctx: ServiceContext,
  input: CreateAssessmentInput,
): Promise<AssessmentDto> {
  assertCan(ctx.user, PERMISSIONS.EXAM_MANAGE);
  const exam = await loadExamInSchool(ctx, input.examId);
  if (exam.isPublished) {
    throw new ConflictError("Cannot add an assessment to a published exam");
  }

  const subject = await ctx.repositories.subjects.findById(input.subjectId);
  if (!subject || subject.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Subject not found");
  }

  const maxPractical = input.maxPractical ?? null;
  const total = input.maxTheory + (maxPractical ?? 0);
  if (input.maxTheory < 0 || (maxPractical !== null && maxPractical < 0)) {
    throw new ValidationError("Maximum marks cannot be negative");
  }
  if (input.passMark < 0 || input.passMark > total) {
    throw new ValidationError("Pass mark must be between 0 and the total maximum");
  }

  return ctx.withTransaction(async (repos) => {
    const created = await repos.assessments.create({
      schoolId: ctx.user.schoolId,
      examId: input.examId,
      subjectId: input.subjectId,
      maxTheory: input.maxTheory,
      maxPractical,
      passMark: input.passMark,
      ...(input.displayOrder !== undefined ? { displayOrder: input.displayOrder } : {}),
    });
    await recordAudit(ctx, repos, {
      action: "ASSESSMENT_CREATE",
      entityType: "Assessment",
      entityId: created.id,
      after: { examId: created.examId, subjectId: created.subjectId },
    });
    return mapAssessment(created);
  });
}

/** List an exam's assessments (admin). */
export async function listAssessments(
  ctx: ServiceContext,
  examId: string,
): Promise<AssessmentDto[]> {
  assertCan(ctx.user, PERMISSIONS.EXAM_MANAGE);
  await loadExamInSchool(ctx, examId);
  const rows = await ctx.repositories.assessments.listByExam(examId);
  return rows.map(mapAssessment);
}
