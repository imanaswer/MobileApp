import type { Mark } from "@prisma/client";

import type { DbClient } from "../db-client";

export type { Mark };

/** Draft-entry payload — the teacher-entered fields only (snapshots are written at lock). */
export interface UpsertMarkInput {
  schoolId: string;
  examSectionId: string;
  assessmentId: string;
  enrollmentId: string;
  theoryObtained?: number | null;
  practicalObtained?: number | null;
  isAbsent: boolean;
  enteredByStaffId: string;
}

/** The frozen result written at LOCK (ADR-012 §3). */
export interface MarkSnapshot {
  totalObtained: number | null;
  percentage: number | null;
  gradeBandId: string | null;
  gradeLetterSnapshot: string | null;
  gradePointSnapshot: number | null;
}

/** Mark persistence (M5). Persistence only — grade computation lives in @repo/core. */
export interface MarkRepository {
  findById(id: string): Promise<Mark | null>;
  listByExamSection(examSectionId: string): Promise<Mark[]>;
  listByEnrollment(enrollmentId: string): Promise<Mark[]>;
  /** Parent-visible marks: register LOCKED AND owning exam published (ADR-012 §2). */
  listPublishedByEnrollment(enrollmentId: string): Promise<Mark[]>;
  /** Idempotent draft upsert on the natural key (assessmentId, enrollmentId). */
  upsert(input: UpsertMarkInput): Promise<Mark>;
  /** Write the computed snapshot (called only at lock). */
  writeSnapshot(id: string, snapshot: MarkSnapshot): Promise<Mark>;
}

export function createMarkRepository(client: DbClient): MarkRepository {
  return {
    findById: (id) => client.mark.findUnique({ where: { id } }),
    listByExamSection: (examSectionId) => client.mark.findMany({ where: { examSectionId } }),
    listByEnrollment: (enrollmentId) => client.mark.findMany({ where: { enrollmentId } }),
    listPublishedByEnrollment: (enrollmentId) =>
      client.mark.findMany({
        where: {
          enrollmentId,
          examSection: { status: "LOCKED", assessment: { exam: { isPublished: true } } },
        },
      }),
    upsert: (input) => {
      const entered = {
        theoryObtained: input.theoryObtained ?? null,
        practicalObtained: input.practicalObtained ?? null,
        isAbsent: input.isAbsent,
        enteredByStaffId: input.enteredByStaffId,
      };
      return client.mark.upsert({
        where: {
          assessmentId_enrollmentId: {
            assessmentId: input.assessmentId,
            enrollmentId: input.enrollmentId,
          },
        },
        create: {
          schoolId: input.schoolId,
          examSectionId: input.examSectionId,
          assessmentId: input.assessmentId,
          enrollmentId: input.enrollmentId,
          ...entered,
        },
        update: entered,
      });
    },
    writeSnapshot: (id, snapshot) => client.mark.update({ where: { id }, data: snapshot }),
  };
}
