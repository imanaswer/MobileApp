import { PERMISSIONS } from "@repo/constants";
import {
  computeMarkResult,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@repo/core";
import type { ExamSection } from "@repo/db";
import type { ExamSectionDto, MarkableAssessmentDto, MarkDto } from "@repo/types";

import { assertCan } from "../../authorization";
import type { ServiceContext } from "../../context";

import { resolveBandsForExam } from "./grade.service";
import {
  assertEnrollmentReadScope,
  assertOwnsAssessmentSection,
  isParent,
  loadAssessmentInSchool,
  loadEnrollmentInSchool,
  loadExamInSchool,
  loadExamSectionInSchool,
  mapExamSection,
  mapMark,
  recordAudit,
  resolveActingStaffId,
} from "./scope";

export interface MarkEntryInput {
  enrollmentId: string;
  theoryObtained?: number | null | undefined;
  practicalObtained?: number | null | undefined;
  isAbsent?: boolean | undefined;
}

export interface SaveMarksInput {
  assessmentId: string;
  sectionId: string;
  marks: MarkEntryInput[];
}

/**
 * Save (draft) marks for an assessment×section — the teacher's entry point.
 * Auto-creates the DRAFT register on first save (createdBy = first saver). Rejects
 * a non-owned assessment/section, a non-DRAFT register (published marks are
 * immutable — corrections go unlock→edit→lock), and per-mark: enrollment not in
 * the section, non-ACTIVE, out of the exam's academic year (ADR-012 §10),
 * obtained > maximum or negative (R4), a practical on a theory-only assessment, or
 * an absent mark carrying obtained values. Bulk upsert + one audit in a single
 * transaction (all-or-nothing).
 */
export async function saveMarks(ctx: ServiceContext, input: SaveMarksInput): Promise<MarkDto[]> {
  assertCan(ctx.user, PERMISSIONS.MARK_ENTER);
  const staffId = await resolveActingStaffId(ctx);
  const assessment = await loadAssessmentInSchool(ctx, input.assessmentId);
  await assertOwnsAssessmentSection(ctx, assessment.subjectId, input.sectionId);

  const section = await ctx.repositories.sections.findById(input.sectionId);
  if (!section) {
    throw new NotFoundError("Section not found");
  }
  const exam = await loadExamInSchool(ctx, assessment.examId);

  if (input.marks.length === 0) {
    throw new ValidationError("No marks provided");
  }

  // An existing register must be DRAFT to accept edits (immutability gate).
  const existing = await ctx.repositories.examSections.findByAssessmentSection(
    input.assessmentId,
    input.sectionId,
  );
  if (existing && existing.status !== "DRAFT") {
    throw new ValidationError(
      existing.status === "LOCKED"
        ? "This register is locked; unlock it to edit marks"
        : "This register is submitted; it must be reopened to edit marks",
    );
  }

  // Pre-validate every entry BEFORE writing (clean bulk rollback + clear errors).
  const maxPractical = assessment.maxPractical;
  for (const m of input.marks) {
    const enrollment = await loadEnrollmentInSchool(ctx, m.enrollmentId);
    if (enrollment.sectionId !== input.sectionId) {
      throw new ForbiddenError("Enrollment is not in this register's section");
    }
    if (enrollment.status !== "ACTIVE") {
      throw new ValidationError("Cannot enter marks for a non-active enrollment");
    }
    if (enrollment.academicYearId !== exam.academicYearId) {
      throw new ValidationError("Enrollment is not in the exam's academic year");
    }
    const isAbsent = m.isAbsent ?? false;
    if (isAbsent) {
      if (m.theoryObtained != null || m.practicalObtained != null) {
        throw new ValidationError("An absent mark cannot carry obtained marks");
      }
      continue;
    }
    if (maxPractical === null && m.practicalObtained != null) {
      throw new ValidationError("This assessment is theory-only (no practical marks)");
    }
    if (
      m.theoryObtained != null &&
      (m.theoryObtained < 0 || m.theoryObtained > assessment.maxTheory)
    ) {
      throw new ValidationError("Theory marks must be between 0 and the maximum");
    }
    if (
      m.practicalObtained != null &&
      (m.practicalObtained < 0 || (maxPractical !== null && m.practicalObtained > maxPractical))
    ) {
      throw new ValidationError("Practical marks must be between 0 and the maximum");
    }
  }

  return ctx.withTransaction(async (repos) => {
    // Race-safe get-or-create: two concurrent first-saves converge on exactly ONE
    // register via `ensure` (atomic INSERT … ON CONFLICT), never a P2002 that would
    // abort the transaction and drop the loser's marks. `existing` (pre-tx) already
    // guaranteed a DRAFT status if present.
    const register = await repos.examSections.ensure({
      schoolId: ctx.user.schoolId,
      assessmentId: input.assessmentId,
      sectionId: input.sectionId,
      createdByStaffId: staffId,
    });
    const saved: MarkDto[] = [];
    for (const m of input.marks) {
      const row = await repos.marks.upsert({
        schoolId: ctx.user.schoolId,
        examSectionId: register.id,
        assessmentId: input.assessmentId,
        enrollmentId: m.enrollmentId,
        theoryObtained: m.theoryObtained ?? null,
        practicalObtained: m.practicalObtained ?? null,
        isAbsent: m.isAbsent ?? false,
        enteredByStaffId: staffId,
      });
      saved.push(mapMark(row));
    }
    await recordAudit(ctx, repos, {
      action: "MARK_SAVE",
      entityType: "ExamSection",
      entityId: register.id,
      after: { savedCount: saved.length },
    });
    return saved;
  });
}

/** DRAFT → SUBMITTED (teacher hands the register to admin review). Guarded. */
export async function submitRegister(
  ctx: ServiceContext,
  examSectionId: string,
): Promise<ExamSectionDto> {
  assertCan(ctx.user, PERMISSIONS.MARK_ENTER);
  const staffId = await resolveActingStaffId(ctx);
  const register = await loadExamSectionInSchool(ctx, examSectionId);
  const assessment = await loadAssessmentInSchool(ctx, register.assessmentId);
  await assertOwnsAssessmentSection(ctx, assessment.subjectId, register.sectionId);
  if (register.status !== "DRAFT") {
    throw new ValidationError("Register must be draft to submit it");
  }

  return ctx.withTransaction(async (repos) => {
    const after = await repos.examSections.transition(register.id, "DRAFT", {
      status: "SUBMITTED",
      submittedByStaffId: staffId,
      submittedAt: new Date(),
    });
    if (!after) {
      throw new ConflictError("Register was already submitted");
    }
    await recordAudit(ctx, repos, {
      action: "MARK_SUBMIT",
      entityType: "ExamSection",
      entityId: register.id,
      before: { status: "DRAFT" },
      after: { status: after.status },
    });
    return mapExamSection(after);
  });
}

/**
 * SUBMITTED → LOCKED (ADMIN review + lock). Computes each mark's grade CENTRALLY
 * (@repo/core) and snapshots it, then guards the transition — all in one
 * transaction. A non-absent percentage that resolves to no band is a misconfigured
 * scale and aborts the whole lock (absent marks are exempt). One audit row.
 */
export async function lockRegister(
  ctx: ServiceContext,
  examSectionId: string,
): Promise<ExamSectionDto> {
  assertCan(ctx.user, PERMISSIONS.EXAM_MANAGE);
  const staffId = await resolveActingStaffId(ctx);
  const register = await loadExamSectionInSchool(ctx, examSectionId);
  if (register.status !== "SUBMITTED") {
    throw new ValidationError("Register must be submitted to lock it");
  }
  const assessment = await loadAssessmentInSchool(ctx, register.assessmentId);
  const exam = await loadExamInSchool(ctx, assessment.examId);
  const bands = await resolveBandsForExam(ctx, exam);
  const marks = await ctx.repositories.marks.listByExamSection(examSectionId);

  // Compute + freeze every result BEFORE writing (clean abort on a scale gap).
  const snapshots = marks.map((m) => {
    // Completeness gate: a non-absent mark must actually be entered — otherwise a
    // blank would lock as 0% → a failing grade for an un-entered student in a
    // published, immutable result. Mark the student absent or enter a value first.
    if (!m.isAbsent) {
      if (m.theoryObtained === null) {
        throw new ValidationError(
          "Register has un-entered marks; mark absent or enter a value before locking",
        );
      }
      if (assessment.maxPractical !== null && m.practicalObtained === null) {
        throw new ValidationError(
          "Register has un-entered practical marks; enter a value before locking",
        );
      }
    }
    const result = computeMarkResult(
      {
        theoryObtained: m.theoryObtained,
        practicalObtained: m.practicalObtained,
        isAbsent: m.isAbsent,
        maxTheory: assessment.maxTheory,
        maxPractical: assessment.maxPractical,
      },
      bands,
    );
    if (!m.isAbsent && result.percentage !== null && result.gradeBandId === null) {
      throw new ValidationError(
        `No grade band covers ${result.percentage}% — the grade scale has a gap`,
      );
    }
    return {
      id: m.id,
      ...result,
      gradeLetterSnapshot: result.gradeLetter,
      gradePointSnapshot: result.gradePoint,
    };
  });

  return ctx.withTransaction(async (repos) => {
    const after = await repos.examSections.transition(register.id, "SUBMITTED", {
      status: "LOCKED",
      lockedByStaffId: staffId,
      lockedAt: new Date(),
    });
    if (!after) {
      throw new ConflictError("Register was already locked");
    }
    for (const s of snapshots) {
      await repos.marks.writeSnapshot(s.id, {
        totalObtained: s.totalObtained,
        percentage: s.percentage,
        gradeBandId: s.gradeBandId,
        gradeLetterSnapshot: s.gradeLetterSnapshot,
        gradePointSnapshot: s.gradePointSnapshot,
      });
    }
    await recordAudit(ctx, repos, {
      action: "MARK_LOCK",
      entityType: "ExamSection",
      entityId: register.id,
      before: { status: "SUBMITTED" },
      after: { status: after.status, snapshotted: snapshots.length },
    });
    return mapExamSection(after);
  });
}

/**
 * LOCKED → DRAFT — the audited unlock (ADMIN). Re-opens a register so marks can be
 * corrected, then re-locked/re-published. Requires a reason (ADR-012 §8); there is
 * no MarkCorrection entity. Guarded + audited.
 */
export async function unlockRegister(
  ctx: ServiceContext,
  input: { examSectionId: string; reason: string },
): Promise<ExamSectionDto> {
  assertCan(ctx.user, PERMISSIONS.EXAM_MANAGE);
  const staffId = await resolveActingStaffId(ctx);
  const register = await loadExamSectionInSchool(ctx, input.examSectionId);
  if (register.status !== "LOCKED") {
    throw new ValidationError("Register must be locked to unlock it");
  }
  if (!input.reason.trim()) {
    throw new ValidationError("An unlock reason is required");
  }

  return ctx.withTransaction(async (repos) => {
    const after = await repos.examSections.transition(register.id, "LOCKED", {
      status: "DRAFT",
      unlockedByStaffId: staffId,
      unlockedAt: new Date(),
      unlockReason: input.reason,
    });
    if (!after) {
      throw new ConflictError("Register is no longer locked");
    }
    await recordAudit(ctx, repos, {
      action: "MARK_UNLOCK",
      entityType: "ExamSection",
      entityId: register.id,
      before: { status: "LOCKED" },
      after: { status: after.status, reason: input.reason },
    });
    return mapExamSection(after);
  });
}

/** The marking grid: a register's marks (admin, or the owning teacher). */
export async function listRegisterMarks(
  ctx: ServiceContext,
  examSectionId: string,
): Promise<MarkDto[]> {
  assertCan(ctx.user, PERMISSIONS.MARK_READ);
  const register = await loadExamSectionInSchool(ctx, examSectionId);
  const assessment = await loadAssessmentInSchool(ctx, register.assessmentId);
  await assertOwnsAssessmentSection(ctx, assessment.subjectId, register.sectionId);
  const rows = await ctx.repositories.marks.listByExamSection(examSectionId);
  return rows.map(mapMark);
}

/**
 * An enrollment's marks. Parents see ONLY published+locked marks for their own
 * child (ADR-012 §2 — never a partial/in-flight result); staff see all. This is
 * the authoritative visibility gate (RLS is defense-in-depth).
 */
export async function marksForEnrollment(
  ctx: ServiceContext,
  enrollmentId: string,
): Promise<MarkDto[]> {
  assertCan(ctx.user, PERMISSIONS.MARK_READ);
  const enrollment = await loadEnrollmentInSchool(ctx, enrollmentId);
  await assertEnrollmentReadScope(ctx, enrollment);
  const rows = isParent(ctx)
    ? await ctx.repositories.marks.listPublishedByEnrollment(enrollmentId)
    : await ctx.repositories.marks.listByEnrollment(enrollmentId);

  // Enrich with subject + exam names so a client that can't read the admin-gated
  // catalogs (a parent) can label rows. ponytail: batched by distinct id, small N.
  const assessmentIds = [...new Set(rows.map((r) => r.assessmentId))];
  const assessments = (
    await Promise.all(assessmentIds.map((id) => ctx.repositories.assessments.findById(id)))
  ).filter((a): a is NonNullable<typeof a> => a !== null);
  const byAssessment = new Map(assessments.map((a) => [a.id, a]));
  const subjectNames = new Map(
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
  const examNames = new Map(
    (
      await Promise.all(
        [...new Set(assessments.map((a) => a.examId))].map((id) =>
          ctx.repositories.exams.findById(id),
        ),
      )
    )
      .filter((e): e is NonNullable<typeof e> => e !== null)
      .map((e) => [e.id, e.name]),
  );
  return rows.map((r) => {
    const a = byAssessment.get(r.assessmentId);
    return {
      ...mapMark(r),
      subjectName: a ? (subjectNames.get(a.subjectId) ?? null) : null,
      examName: a ? (examNames.get(a.examId) ?? null) : null,
    };
  });
}

/**
 * The teacher's markable targets for the ACTIVE year (mobile "assessment list"):
 * every (assessment × section) the teacher is assigned to, with the register's
 * status + id (null until first save). Composed from existing repos — ponytail:
 * in-memory join, small N (a teacher's assignments × the year's exams); upgrade to
 * one indexed query if a teacher ever spans many exams. Admins hold MARK_ENTER but
 * have no assignments → empty (they manage on web).
 */
export async function markableAssessments(ctx: ServiceContext): Promise<MarkableAssessmentDto[]> {
  assertCan(ctx.user, PERMISSIONS.MARK_ENTER);
  const activeYear = await ctx.repositories.academicYears.findActive(ctx.user.schoolId);
  if (!activeYear) {
    return [];
  }
  const assignments = await ctx.repositories.teacherAssignments.list(ctx.user.schoolId, {
    teacherId: ctx.user.userId,
  });
  if (assignments.length === 0) {
    return [];
  }
  const sectionsBySubject = new Map<string, Set<string>>();
  for (const t of assignments) {
    (
      sectionsBySubject.get(t.subjectId) ??
      sectionsBySubject.set(t.subjectId, new Set()).get(t.subjectId)!
    ).add(t.sectionId);
  }
  const sectionName = new Map<string, string>();
  const nameOfSection = async (id: string): Promise<string> => {
    const cached = sectionName.get(id);
    if (cached !== undefined) {
      return cached;
    }
    const section = await ctx.repositories.sections.findById(id);
    const name = section?.name ?? id;
    sectionName.set(id, name);
    return name;
  };
  const subjectName = new Map<string, string>();
  const nameOfSubject = async (id: string): Promise<string> => {
    const cached = subjectName.get(id);
    if (cached !== undefined) {
      return cached;
    }
    const subject = await ctx.repositories.subjects.findById(id);
    const name = subject?.name ?? id;
    subjectName.set(id, name);
    return name;
  };

  const exams = await ctx.repositories.exams.listByYear(ctx.user.schoolId, activeYear.id);
  const out: MarkableAssessmentDto[] = [];
  for (const exam of exams) {
    const assessments = await ctx.repositories.assessments.listByExam(exam.id);
    for (const a of assessments) {
      const sectionIds = sectionsBySubject.get(a.subjectId);
      if (!sectionIds) {
        continue;
      }
      for (const sectionId of sectionIds) {
        const register = await ctx.repositories.examSections.findByAssessmentSection(
          a.id,
          sectionId,
        );
        out.push({
          assessmentId: a.id,
          examId: exam.id,
          examName: exam.name,
          subjectId: a.subjectId,
          subjectName: await nameOfSubject(a.subjectId),
          sectionId,
          sectionName: await nameOfSection(sectionId),
          maxTheory: a.maxTheory,
          maxPractical: a.maxPractical,
          registerStatus: register?.status ?? "NONE",
          examSectionId: register?.id ?? null,
        });
      }
    }
  }
  return out;
}

// Re-exported for tests/readers: the register type used by the workflow.
export type { ExamSection };
