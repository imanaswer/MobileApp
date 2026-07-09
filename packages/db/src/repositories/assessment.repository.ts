import type { Assessment } from "@prisma/client";

import type { DbClient } from "../db-client";

export type { Assessment };

export interface CreateAssessmentInput {
  schoolId: string;
  examId: string;
  subjectId: string;
  maxTheory: number;
  maxPractical?: number | null;
  passMark: number;
  displayOrder?: number;
}

/** Assessment persistence (M5). Persistence only. */
export interface AssessmentRepository {
  findById(id: string): Promise<Assessment | null>;
  listByExam(examId: string): Promise<Assessment[]>;
  create(input: CreateAssessmentInput): Promise<Assessment>;
}

export function createAssessmentRepository(client: DbClient): AssessmentRepository {
  return {
    findById: (id) => client.assessment.findUnique({ where: { id } }),
    listByExam: (examId) =>
      client.assessment.findMany({
        where: { examId },
        orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
      }),
    create: (input) =>
      client.assessment.create({
        data: {
          schoolId: input.schoolId,
          examId: input.examId,
          subjectId: input.subjectId,
          maxTheory: input.maxTheory,
          maxPractical: input.maxPractical ?? null,
          passMark: input.passMark,
          displayOrder: input.displayOrder ?? 0,
        },
      }),
  };
}
