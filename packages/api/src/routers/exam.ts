import {
  createAssessment,
  createExam,
  createGradeScale,
  createServiceContext,
  deleteAssessment,
  deleteExam,
  deleteExamSection,
  getExam,
  gpaForEnrollment,
  listAssessments,
  listExamRegisters,
  listExams,
  listGradeScales,
  listRegisterMarks,
  lockRegister,
  markableAssessments,
  marksForEnrollment,
  publishExam,
  saveMarks,
  submitRegister,
  unlockRegister,
  updateExam,
} from "@repo/business";
import {
  academicYearIdInput,
  assessmentIdInput,
  createAssessmentInput,
  createExamInput,
  createGradeScaleInput,
  enrollmentIdInput,
  examIdInput,
  examSectionIdInput,
  saveMarksInput,
  unlockRegisterInput,
  updateExamInput,
} from "@repo/validation";

import { protectedProcedure, router } from "../trpc";

/**
 * Examination & Assessment procedures (M5, ADR-012). Thin transport only —
 * validate (Zod) then delegate to a business service; the service enforces
 * permission + scope (admin manage/lock/publish; teacher own subject×section
 * save/submit; parent own-child PUBLISHED reads), the DRAFT→SUBMITTED→LOCKED
 * lifecycle, central grade snapshotting, and writes audit in-transaction
 * (ADR-002/007/012). No logic, no role strings, no Prisma.
 */

export const examRouter = router({
  create: protectedProcedure
    .input(createExamInput)
    .mutation(({ ctx, input }) => createExam(createServiceContext(ctx.user), input)),
  update: protectedProcedure
    .input(updateExamInput)
    .mutation(({ ctx, input }) => updateExam(createServiceContext(ctx.user), input.examId, input)),
  publish: protectedProcedure
    .input(examIdInput)
    .mutation(({ ctx, input }) => publishExam(createServiceContext(ctx.user), input.examId)),
  list: protectedProcedure
    .input(academicYearIdInput)
    .query(({ ctx, input }) => listExams(createServiceContext(ctx.user), input.academicYearId)),
  get: protectedProcedure
    .input(examIdInput)
    .query(({ ctx, input }) => getExam(createServiceContext(ctx.user), input.examId)),
  registers: protectedProcedure
    .input(examIdInput)
    .query(({ ctx, input }) => listExamRegisters(createServiceContext(ctx.user), input.examId)),
  delete: protectedProcedure
    .input(examIdInput)
    .mutation(({ ctx, input }) => deleteExam(createServiceContext(ctx.user), input.examId)),
});

export const assessmentRouter = router({
  create: protectedProcedure
    .input(createAssessmentInput)
    .mutation(({ ctx, input }) => createAssessment(createServiceContext(ctx.user), input)),
  list: protectedProcedure
    .input(examIdInput)
    .query(({ ctx, input }) => listAssessments(createServiceContext(ctx.user), input.examId)),
  delete: protectedProcedure
    .input(assessmentIdInput)
    .mutation(({ ctx, input }) =>
      deleteAssessment(createServiceContext(ctx.user), input.assessmentId),
    ),
});

export const markRouter = router({
  /** A teacher's markable (assessment × section) targets for the active year (mobile). */
  markable: protectedProcedure.query(({ ctx }) =>
    markableAssessments(createServiceContext(ctx.user)),
  ),
  save: protectedProcedure
    .input(saveMarksInput)
    .mutation(({ ctx, input }) => saveMarks(createServiceContext(ctx.user), input)),
  submit: protectedProcedure
    .input(examSectionIdInput)
    .mutation(({ ctx, input }) =>
      submitRegister(createServiceContext(ctx.user), input.examSectionId),
    ),
  lock: protectedProcedure
    .input(examSectionIdInput)
    .mutation(({ ctx, input }) =>
      lockRegister(createServiceContext(ctx.user), input.examSectionId),
    ),
  unlock: protectedProcedure
    .input(unlockRegisterInput)
    .mutation(({ ctx, input }) => unlockRegister(createServiceContext(ctx.user), input)),
  /** The marking grid for a register (admin, or the owning teacher). */
  listByRegister: protectedProcedure
    .input(examSectionIdInput)
    .query(({ ctx, input }) =>
      listRegisterMarks(createServiceContext(ctx.user), input.examSectionId),
    ),
  /** An enrollment's marks — parents see only PUBLISHED+LOCKED own-child (ADR-012 §2). */
  listByEnrollment: protectedProcedure
    .input(enrollmentIdInput)
    .query(({ ctx, input }) =>
      marksForEnrollment(createServiceContext(ctx.user), input.enrollmentId),
    ),
  /** Enrollment GPA from snapshots (parents: published+locked only). */
  gpa: protectedProcedure
    .input(enrollmentIdInput)
    .query(({ ctx, input }) =>
      gpaForEnrollment(createServiceContext(ctx.user), input.enrollmentId),
    ),
  /** Delete a register — routed through the published-data deletion guard (ADR-012 R5). */
  deleteRegister: protectedProcedure
    .input(examSectionIdInput)
    .mutation(({ ctx, input }) =>
      deleteExamSection(createServiceContext(ctx.user), input.examSectionId),
    ),
});

export const gradeScaleRouter = router({
  create: protectedProcedure
    .input(createGradeScaleInput)
    .mutation(({ ctx, input }) => createGradeScale(createServiceContext(ctx.user), input)),
  list: protectedProcedure.query(({ ctx }) => listGradeScales(createServiceContext(ctx.user))),
});
