import type { BellSchedule } from "@prisma/client";

import type { DbClient } from "../db-client";

export type { BellSchedule };

export interface CreateBellScheduleInput {
  schoolId: string;
  academicYearId: string;
  name: string;
}

export interface UpdateBellScheduleInput {
  name: string;
}

/**
 * Persistence for `BellSchedule` (ADR-003, ADR-017). No authorization/business
 * rules. Exactly one per year — enforced by the DB unique `(schoolId,
 * academicYearId)`; `findByYear` is the single-row lookup.
 */
export interface BellScheduleRepository {
  findById(id: string): Promise<BellSchedule | null>;
  /** The single bell schedule of a year, or null. */
  findByYear(academicYearId: string): Promise<BellSchedule | null>;
  create(input: CreateBellScheduleInput): Promise<BellSchedule>;
  update(id: string, input: UpdateBellScheduleInput): Promise<BellSchedule>;
}

export function createBellScheduleRepository(client: DbClient): BellScheduleRepository {
  return {
    findById: (id) => client.bellSchedule.findUnique({ where: { id } }),
    findByYear: (academicYearId) => client.bellSchedule.findFirst({ where: { academicYearId } }),
    create: (input) => client.bellSchedule.create({ data: input }),
    update: (id, input) => client.bellSchedule.update({ where: { id }, data: input }),
  };
}
