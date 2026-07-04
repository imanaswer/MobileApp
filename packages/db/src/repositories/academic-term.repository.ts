import type { AcademicTerm } from "@prisma/client";

import type { DbClient } from "../db-client";

export type { AcademicTerm };

export interface CreateAcademicTermInput {
  academicYearId: string;
  name: string;
  startDate: Date;
  endDate: Date;
}

export interface UpdateAcademicTermInput {
  name?: string | undefined;
  startDate?: Date | undefined;
  endDate?: Date | undefined;
}

/** Persistence for `AcademicTerm` (ADR-003). No authorization/business rules. */
export interface AcademicTermRepository {
  listByYear(academicYearId: string): Promise<AcademicTerm[]>;
  findById(id: string): Promise<AcademicTerm | null>;
  findByName(academicYearId: string, name: string): Promise<AcademicTerm | null>;
  /**
   * Any sibling term whose inclusive date range intersects [start, end], optionally
   * excluding one id (for updates). Mirrors the DB EXCLUDE gist constraint so the
   * overlap decision stays in the business layer without reimplementing it loosely.
   */
  findOverlapping(
    academicYearId: string,
    startDate: Date,
    endDate: Date,
    excludeId?: string,
  ): Promise<AcademicTerm | null>;
  create(input: CreateAcademicTermInput): Promise<AcademicTerm>;
  update(id: string, data: UpdateAcademicTermInput): Promise<AcademicTerm>;
  delete(id: string): Promise<void>;
}

export function createAcademicTermRepository(client: DbClient): AcademicTermRepository {
  return {
    listByYear: (academicYearId) =>
      client.academicTerm.findMany({ where: { academicYearId }, orderBy: { startDate: "asc" } }),
    findById: (id) => client.academicTerm.findUnique({ where: { id } }),
    findByName: (academicYearId, name) =>
      client.academicTerm.findUnique({
        where: { academicYearId_name: { academicYearId, name } },
      }),
    // Inclusive overlap: existing.start <= new.end AND existing.end >= new.start.
    findOverlapping: (academicYearId, startDate, endDate, excludeId) =>
      client.academicTerm.findFirst({
        where: {
          academicYearId,
          startDate: { lte: endDate },
          endDate: { gte: startDate },
          ...(excludeId ? { id: { not: excludeId } } : {}),
        },
      }),
    create: (input) => client.academicTerm.create({ data: input }),
    update: (id, data) =>
      client.academicTerm.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.startDate !== undefined ? { startDate: data.startDate } : {}),
          ...(data.endDate !== undefined ? { endDate: data.endDate } : {}),
        },
      }),
    delete: async (id) => {
      await client.academicTerm.delete({ where: { id } });
    },
  };
}
