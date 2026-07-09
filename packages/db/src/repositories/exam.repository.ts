import type { Exam } from "@prisma/client";

import type { DbClient } from "../db-client";

export type { Exam };

/** Minimal exam identity the deletion guard needs (ADR-012 R5). */
export interface ExamDeletionRef {
  examId: string;
  schoolId: string;
  isPublished: boolean;
}

export interface CreateExamInput {
  schoolId: string;
  academicYearId: string;
  gradeScaleId?: string | null;
  name: string;
  type: Exam["type"];
  displayOrder?: number;
  startDate?: Date | null;
  endDate?: Date | null;
}

export interface UpdateExamInput {
  name?: string;
  type?: Exam["type"];
  displayOrder?: number;
  gradeScaleId?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
}

/**
 * Exam persistence (M5, ADR-012). Persistence only — the published/locked DELETION
 * GUARD and the publish/lock workflow live in the business layer.
 */
export interface ExamRepository {
  findById(id: string): Promise<Exam | null>;
  listByYear(schoolId: string, academicYearId: string): Promise<Exam[]>;
  create(input: CreateExamInput): Promise<Exam>;
  update(id: string, data: UpdateExamInput): Promise<Exam>;
  /** Guarded publish: sets isPublished only if still unpublished (null if already published). */
  publish(
    id: string,
    data: { publishedByStaffId: string; publishedAt: Date },
  ): Promise<Exam | null>;
  // ---- deletion guard surface (ADR-012 R5) ----
  findDeletionRefById(id: string): Promise<ExamDeletionRef | null>;
  findDeletionRefByAssessment(assessmentId: string): Promise<ExamDeletionRef | null>;
  findDeletionRefByExamSection(examSectionId: string): Promise<ExamDeletionRef | null>;
  hasLockedSection(examId: string): Promise<boolean>;
  deleteExam(id: string): Promise<void>;
  deleteAssessment(id: string): Promise<void>;
  deleteExamSection(id: string): Promise<void>;
}

export function createExamRepository(client: DbClient): ExamRepository {
  const refSelect = { id: true, schoolId: true, isPublished: true } as const;
  const toRef = (row: { id: string; schoolId: string; isPublished: boolean }): ExamDeletionRef => ({
    examId: row.id,
    schoolId: row.schoolId,
    isPublished: row.isPublished,
  });

  return {
    findById: (id) => client.exam.findUnique({ where: { id } }),
    listByYear: (schoolId, academicYearId) =>
      client.exam.findMany({
        where: { schoolId, academicYearId },
        orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      }),
    create: (input) =>
      client.exam.create({
        data: {
          schoolId: input.schoolId,
          academicYearId: input.academicYearId,
          gradeScaleId: input.gradeScaleId ?? null,
          name: input.name,
          type: input.type,
          displayOrder: input.displayOrder ?? 0,
          startDate: input.startDate ?? null,
          endDate: input.endDate ?? null,
        },
      }),
    update: (id, data) => client.exam.update({ where: { id }, data }),
    publish: async (id, data) => {
      const res = await client.exam.updateMany({
        where: { id, isPublished: false },
        data: {
          isPublished: true,
          publishedByStaffId: data.publishedByStaffId,
          publishedAt: data.publishedAt,
        },
      });
      return res.count === 0 ? null : client.exam.findUnique({ where: { id } });
    },
    findDeletionRefById: async (id) => {
      const row = await client.exam.findUnique({ where: { id }, select: refSelect });
      return row ? toRef(row) : null;
    },
    findDeletionRefByAssessment: async (assessmentId) => {
      const row = await client.assessment.findUnique({
        where: { id: assessmentId },
        select: { exam: { select: refSelect } },
      });
      return row ? toRef(row.exam) : null;
    },
    findDeletionRefByExamSection: async (examSectionId) => {
      const row = await client.examSection.findUnique({
        where: { id: examSectionId },
        select: { assessment: { select: { exam: { select: refSelect } } } },
      });
      return row ? toRef(row.assessment.exam) : null;
    },
    hasLockedSection: async (examId) => {
      const locked = await client.examSection.count({
        where: { status: "LOCKED", assessment: { examId } },
      });
      return locked > 0;
    },
    deleteExam: async (id) => {
      await client.exam.delete({ where: { id } });
    },
    deleteAssessment: async (id) => {
      await client.assessment.delete({ where: { id } });
    },
    deleteExamSection: async (id) => {
      await client.examSection.delete({ where: { id } });
    },
  };
}
