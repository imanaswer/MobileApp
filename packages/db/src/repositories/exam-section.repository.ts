import type { ExamSection, ExamSectionStatus } from "@prisma/client";

import type { DbClient } from "../db-client";

export type { ExamSection, ExamSectionStatus };

export interface CreateExamSectionInput {
  schoolId: string;
  assessmentId: string;
  sectionId: string;
  createdByStaffId: string;
}

export interface TransitionExamSectionInput {
  status: ExamSectionStatus;
  submittedByStaffId?: string | null | undefined;
  submittedAt?: Date | null | undefined;
  lockedByStaffId?: string | null | undefined;
  lockedAt?: Date | null | undefined;
  unlockedByStaffId?: string | null | undefined;
  unlockedAt?: Date | null | undefined;
  unlockReason?: string | null | undefined;
}

/** ExamSection (the register) persistence (M5, ADR-012). Persistence only. */
export interface ExamSectionRepository {
  findById(id: string): Promise<ExamSection | null>;
  findByAssessmentSection(assessmentId: string, sectionId: string): Promise<ExamSection | null>;
  /** Every register under the given assessments (admin exam-oversight/publish view). */
  listByAssessmentIds(assessmentIds: string[]): Promise<ExamSection[]>;
  create(input: CreateExamSectionInput): Promise<ExamSection>;
  /**
   * Race-safe get-or-create on the natural key (assessmentId, sectionId). Uses an
   * `INSERT … ON CONFLICT DO NOTHING`-style upsert so two concurrent first-saves
   * converge on exactly ONE register WITHOUT throwing P2002 (a raw P2002 inside a
   * transaction aborts it — this never does). Existing `createdByStaffId` is kept.
   */
  ensure(input: CreateExamSectionInput): Promise<ExamSection>;
  /** Guarded state transition — applies `data` only if still in `fromStatus`; null
   *  if a concurrent writer already moved it (no double-transition/audit). */
  transition(
    id: string,
    fromStatus: ExamSectionStatus,
    data: TransitionExamSectionInput,
  ): Promise<ExamSection | null>;
}

export function createExamSectionRepository(client: DbClient): ExamSectionRepository {
  return {
    findById: (id) => client.examSection.findUnique({ where: { id } }),
    findByAssessmentSection: (assessmentId, sectionId) =>
      client.examSection.findUnique({
        where: { assessmentId_sectionId: { assessmentId, sectionId } },
      }),
    listByAssessmentIds: (assessmentIds) =>
      client.examSection.findMany({ where: { assessmentId: { in: assessmentIds } } }),
    create: (input) =>
      client.examSection.create({
        data: {
          schoolId: input.schoolId,
          assessmentId: input.assessmentId,
          sectionId: input.sectionId,
          createdByStaffId: input.createdByStaffId,
        },
      }),
    ensure: (input) =>
      // upsert compiles to a single atomic INSERT ... ON CONFLICT DO UPDATE (empty
      // update = no-op) → conflict returns the existing row, never a P2002 abort.
      client.examSection.upsert({
        where: {
          assessmentId_sectionId: {
            assessmentId: input.assessmentId,
            sectionId: input.sectionId,
          },
        },
        create: {
          schoolId: input.schoolId,
          assessmentId: input.assessmentId,
          sectionId: input.sectionId,
          createdByStaffId: input.createdByStaffId,
        },
        update: {},
      }),
    transition: async (id, fromStatus, data) => {
      const res = await client.examSection.updateMany({
        where: { id, status: fromStatus },
        data: {
          status: data.status,
          ...(data.submittedByStaffId !== undefined
            ? { submittedByStaffId: data.submittedByStaffId }
            : {}),
          ...(data.submittedAt !== undefined ? { submittedAt: data.submittedAt } : {}),
          ...(data.lockedByStaffId !== undefined ? { lockedByStaffId: data.lockedByStaffId } : {}),
          ...(data.lockedAt !== undefined ? { lockedAt: data.lockedAt } : {}),
          ...(data.unlockedByStaffId !== undefined
            ? { unlockedByStaffId: data.unlockedByStaffId }
            : {}),
          ...(data.unlockedAt !== undefined ? { unlockedAt: data.unlockedAt } : {}),
          ...(data.unlockReason !== undefined ? { unlockReason: data.unlockReason } : {}),
        },
      });
      return res.count === 0 ? null : client.examSection.findUnique({ where: { id } });
    },
  };
}
