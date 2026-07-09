import { PERMISSIONS } from "@repo/constants";
import { ConflictError, NotFoundError, ValidationError } from "@repo/core";
import type { ExamDto, ExamRegisterDto, ExamTypeKey } from "@repo/types";

import { assertCan } from "../../authorization";
import type { ServiceContext } from "../../context";

import { loadExamInSchool, mapExam, recordAudit, resolveActingStaffId } from "./scope";

export interface CreateExamInput {
  academicYearId: string;
  gradeScaleId?: string | null | undefined;
  name: string;
  type: ExamTypeKey;
  displayOrder?: number | undefined;
  startDate?: Date | null | undefined;
  endDate?: Date | null | undefined;
}

export interface UpdateExamInput {
  name?: string | undefined;
  type?: ExamTypeKey | undefined;
  displayOrder?: number | undefined;
  gradeScaleId?: string | null | undefined;
  startDate?: Date | null | undefined;
  endDate?: Date | null | undefined;
}

async function assertYearInSchool(ctx: ServiceContext, id: string): Promise<void> {
  const year = await ctx.repositories.academicYears.findById(id);
  if (!year || year.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Academic year not found");
  }
}

async function assertScaleInSchool(
  ctx: ServiceContext,
  id: string | null | undefined,
): Promise<void> {
  if (!id) {
    return;
  }
  const scale = await ctx.repositories.gradeScales.findByIdWithBands(id);
  if (!scale || scale.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Grade scale not found");
  }
}

/** Create an exam (admin). Validates year + optional grade scale are in-school. Audited. */
export async function createExam(ctx: ServiceContext, input: CreateExamInput): Promise<ExamDto> {
  assertCan(ctx.user, PERMISSIONS.EXAM_MANAGE);
  await assertYearInSchool(ctx, input.academicYearId);
  await assertScaleInSchool(ctx, input.gradeScaleId);

  return ctx.withTransaction(async (repos) => {
    const created = await repos.exams.create({
      schoolId: ctx.user.schoolId,
      academicYearId: input.academicYearId,
      gradeScaleId: input.gradeScaleId ?? null,
      name: input.name,
      type: input.type,
      ...(input.displayOrder !== undefined ? { displayOrder: input.displayOrder } : {}),
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
    });
    await recordAudit(ctx, repos, {
      action: "EXAM_CREATE",
      entityType: "Exam",
      entityId: created.id,
      after: { name: created.name, type: created.type },
    });
    return mapExam(created);
  });
}

/** Update an exam's definition (admin). Blocked once published — a published exam's
 *  definition is frozen (ADR-012 §2). Audited. */
export async function updateExam(
  ctx: ServiceContext,
  examId: string,
  input: UpdateExamInput,
): Promise<ExamDto> {
  assertCan(ctx.user, PERMISSIONS.EXAM_MANAGE);
  const exam = await loadExamInSchool(ctx, examId);
  if (exam.isPublished) {
    throw new ConflictError("A published exam cannot be edited");
  }
  if (input.gradeScaleId !== undefined) {
    await assertScaleInSchool(ctx, input.gradeScaleId);
  }

  return ctx.withTransaction(async (repos) => {
    const updated = await repos.exams.update(examId, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.displayOrder !== undefined ? { displayOrder: input.displayOrder } : {}),
      ...(input.gradeScaleId !== undefined ? { gradeScaleId: input.gradeScaleId } : {}),
      ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
      ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
    });
    await recordAudit(ctx, repos, {
      action: "EXAM_UPDATE",
      entityType: "Exam",
      entityId: examId,
      after: { name: updated.name },
    });
    return mapExam(updated);
  });
}

/**
 * Publish an exam (admin) — the parent-visibility gate (ADR-012 §2). Exposes every
 * LOCKED section beneath it; sections still DRAFT/SUBMITTED stay invisible. Guarded
 * so a double-publish is a no-op Conflict, audited once. Sends NO notification
 * (M5 excludes notifications).
 */
export async function publishExam(ctx: ServiceContext, examId: string): Promise<ExamDto> {
  assertCan(ctx.user, PERMISSIONS.EXAM_MANAGE);
  const staffId = await resolveActingStaffId(ctx);
  await loadExamInSchool(ctx, examId);

  return ctx.withTransaction(async (repos) => {
    const published = await repos.exams.publish(examId, {
      publishedByStaffId: staffId,
      publishedAt: new Date(),
    });
    if (!published) {
      throw new ConflictError("Exam is already published");
    }
    await recordAudit(ctx, repos, {
      action: "EXAM_PUBLISH",
      entityType: "Exam",
      entityId: examId,
      before: { isPublished: false },
      after: { isPublished: true },
    });
    return mapExam(published);
  });
}

/**
 * Every register under one exam, name-enriched (admin oversight + publish view).
 * Admins have no TeacherAssignment so `markable` is empty for them — this is how
 * the web console discovers registers to lock/unlock and to show the publish
 * locked-vs-total count (ADR-012 R3). ponytail: in-memory join, batched by
 * distinct id, small N (an exam's assessments × their sections).
 */
export async function listExamRegisters(
  ctx: ServiceContext,
  examId: string,
): Promise<ExamRegisterDto[]> {
  assertCan(ctx.user, PERMISSIONS.EXAM_MANAGE);
  await loadExamInSchool(ctx, examId);
  const assessments = await ctx.repositories.assessments.listByExam(examId);
  const registers = await ctx.repositories.examSections.listByAssessmentIds(
    assessments.map((a) => a.id),
  );
  const subjectId = new Map(assessments.map((a) => [a.id, a.subjectId]));
  const subjectName = new Map(
    (
      await Promise.all(
        [...new Set(assessments.map((a) => a.subjectId))].map((id) =>
          ctx.repositories.subjects.findById(id),
        ),
      )
    )
      .filter((s): s is NonNullable<typeof s> => s !== null)
      .map((s) => [s.id, s.name]),
  );
  const sectionName = new Map(
    (
      await Promise.all(
        [...new Set(registers.map((r) => r.sectionId))].map((id) =>
          ctx.repositories.sections.findById(id),
        ),
      )
    )
      .filter((s): s is NonNullable<typeof s> => s !== null)
      .map((s) => [s.id, s.name]),
  );
  return registers.map((r) => {
    const subId = subjectId.get(r.assessmentId) ?? "";
    return {
      examSectionId: r.id,
      assessmentId: r.assessmentId,
      subjectId: subId,
      subjectName: subjectName.get(subId) ?? "—",
      sectionId: r.sectionId,
      sectionName: sectionName.get(r.sectionId) ?? "—",
      status: r.status,
    };
  });
}

/** One exam (admin detail page). */
export async function getExam(ctx: ServiceContext, examId: string): Promise<ExamDto> {
  assertCan(ctx.user, PERMISSIONS.EXAM_MANAGE);
  return mapExam(await loadExamInSchool(ctx, examId));
}

/** List exams for a year (admin dashboard). */
export async function listExams(ctx: ServiceContext, academicYearId: string): Promise<ExamDto[]> {
  assertCan(ctx.user, PERMISSIONS.EXAM_MANAGE);
  if (!academicYearId) {
    throw new ValidationError("academicYearId is required");
  }
  const rows = await ctx.repositories.exams.listByYear(ctx.user.schoolId, academicYearId);
  return rows.map(mapExam);
}
