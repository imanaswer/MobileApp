import {
  createAcademicTerm,
  createAcademicYear,
  createClass,
  createSection,
  createServiceContext,
  createSubject,
  createTeacherAssignment,
  deleteAcademicTerm,
  deleteAcademicYear,
  deleteClass,
  deleteSection,
  deleteSubject,
  deleteTeacherAssignment,
  getAcademicTerm,
  getAcademicYear,
  getClass,
  getSection,
  getSubject,
  getTeacherAssignment,
  listAcademicTerms,
  listAcademicYears,
  listClasses,
  listSections,
  listSubjects,
  listTeacherAssignments,
  updateAcademicTerm,
  updateAcademicYear,
  updateClass,
  updateSection,
  updateSubject,
} from "@repo/business";
import {
  academicYearIdInput,
  classIdInput,
  createAcademicTermInput,
  createAcademicYearInput,
  createClassInput,
  createSectionInput,
  createSubjectInput,
  createTeacherAssignmentInput,
  idInput,
  listTeacherAssignmentsInput,
  updateAcademicTermInput,
  updateAcademicYearInput,
  updateClassInput,
  updateSectionInput,
  updateSubjectInput,
} from "@repo/validation";

import { protectedProcedure, router } from "../trpc";

/**
 * Academic-structure procedures (M2). Thin transport only — validate (Zod) then
 * delegate to a business service; the service enforces permission + scope and
 * writes audit in-transaction (ADR-002/007). No logic, no role strings, no Prisma.
 * All run on `protectedProcedure` (ACTIVE); reads are gated by ACADEMIC_READ and
 * mutations by ACADEMIC_MANAGE inside the service.
 */

export const academicYearRouter = router({
  list: protectedProcedure.query(({ ctx }) => listAcademicYears(createServiceContext(ctx.user))),
  get: protectedProcedure
    .input(idInput)
    .query(({ ctx, input }) => getAcademicYear(createServiceContext(ctx.user), input.id)),
  create: protectedProcedure
    .input(createAcademicYearInput)
    .mutation(({ ctx, input }) => createAcademicYear(createServiceContext(ctx.user), input)),
  update: protectedProcedure
    .input(updateAcademicYearInput)
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return updateAcademicYear(createServiceContext(ctx.user), id, data);
    }),
  delete: protectedProcedure
    .input(idInput)
    .mutation(({ ctx, input }) => deleteAcademicYear(createServiceContext(ctx.user), input.id)),
});

export const academicTermRouter = router({
  list: protectedProcedure
    .input(academicYearIdInput)
    .query(({ ctx, input }) =>
      listAcademicTerms(createServiceContext(ctx.user), input.academicYearId),
    ),
  get: protectedProcedure
    .input(idInput)
    .query(({ ctx, input }) => getAcademicTerm(createServiceContext(ctx.user), input.id)),
  create: protectedProcedure
    .input(createAcademicTermInput)
    .mutation(({ ctx, input }) => createAcademicTerm(createServiceContext(ctx.user), input)),
  update: protectedProcedure
    .input(updateAcademicTermInput)
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return updateAcademicTerm(createServiceContext(ctx.user), id, data);
    }),
  delete: protectedProcedure
    .input(idInput)
    .mutation(({ ctx, input }) => deleteAcademicTerm(createServiceContext(ctx.user), input.id)),
});

export const classRouter = router({
  list: protectedProcedure.query(({ ctx }) => listClasses(createServiceContext(ctx.user))),
  get: protectedProcedure
    .input(idInput)
    .query(({ ctx, input }) => getClass(createServiceContext(ctx.user), input.id)),
  create: protectedProcedure
    .input(createClassInput)
    .mutation(({ ctx, input }) => createClass(createServiceContext(ctx.user), input)),
  update: protectedProcedure
    .input(updateClassInput)
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return updateClass(createServiceContext(ctx.user), id, data);
    }),
  delete: protectedProcedure
    .input(idInput)
    .mutation(({ ctx, input }) => deleteClass(createServiceContext(ctx.user), input.id)),
});

export const sectionRouter = router({
  list: protectedProcedure
    .input(classIdInput)
    .query(({ ctx, input }) => listSections(createServiceContext(ctx.user), input.classId)),
  get: protectedProcedure
    .input(idInput)
    .query(({ ctx, input }) => getSection(createServiceContext(ctx.user), input.id)),
  create: protectedProcedure
    .input(createSectionInput)
    .mutation(({ ctx, input }) => createSection(createServiceContext(ctx.user), input)),
  update: protectedProcedure
    .input(updateSectionInput)
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return updateSection(createServiceContext(ctx.user), id, data);
    }),
  delete: protectedProcedure
    .input(idInput)
    .mutation(({ ctx, input }) => deleteSection(createServiceContext(ctx.user), input.id)),
});

export const subjectRouter = router({
  list: protectedProcedure.query(({ ctx }) => listSubjects(createServiceContext(ctx.user))),
  get: protectedProcedure
    .input(idInput)
    .query(({ ctx, input }) => getSubject(createServiceContext(ctx.user), input.id)),
  create: protectedProcedure
    .input(createSubjectInput)
    .mutation(({ ctx, input }) => createSubject(createServiceContext(ctx.user), input)),
  update: protectedProcedure
    .input(updateSubjectInput)
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return updateSubject(createServiceContext(ctx.user), id, data);
    }),
  delete: protectedProcedure
    .input(idInput)
    .mutation(({ ctx, input }) => deleteSubject(createServiceContext(ctx.user), input.id)),
});

export const teacherAssignmentRouter = router({
  list: protectedProcedure
    .input(listTeacherAssignmentsInput.optional())
    .query(({ ctx, input }) =>
      listTeacherAssignments(createServiceContext(ctx.user), input ?? {}),
    ),
  get: protectedProcedure
    .input(idInput)
    .query(({ ctx, input }) => getTeacherAssignment(createServiceContext(ctx.user), input.id)),
  create: protectedProcedure
    .input(createTeacherAssignmentInput)
    .mutation(({ ctx, input }) => createTeacherAssignment(createServiceContext(ctx.user), input)),
  delete: protectedProcedure
    .input(idInput)
    .mutation(({ ctx, input }) => deleteTeacherAssignment(createServiceContext(ctx.user), input.id)),
});
