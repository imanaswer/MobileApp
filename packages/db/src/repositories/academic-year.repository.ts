import type { AcademicYear, AcademicYearStatus } from "@prisma/client";

import type { DbClient } from "../db-client";

export type { AcademicYear };

export interface CreateAcademicYearInput {
  schoolId: string;
  name: string;
  startDate: Date;
  endDate: Date;
  status?: AcademicYearStatus;
}

export interface UpdateAcademicYearInput {
  name?: string | undefined;
  startDate?: Date | undefined;
  endDate?: Date | undefined;
  status?: AcademicYearStatus | undefined;
}

/** Persistence for `AcademicYear` (ADR-003). No authorization/business rules. */
export interface AcademicYearRepository {
  list(schoolId: string): Promise<AcademicYear[]>;
  findById(id: string): Promise<AcademicYear | null>;
  findByName(schoolId: string, name: string): Promise<AcademicYear | null>;
  /** The one ACTIVE year for a school, if any (drives the one-active rule). */
  findActive(schoolId: string): Promise<AcademicYear | null>;
  create(input: CreateAcademicYearInput): Promise<AcademicYear>;
  update(id: string, data: UpdateAcademicYearInput): Promise<AcademicYear>;
  delete(id: string): Promise<void>;
}

export function createAcademicYearRepository(client: DbClient): AcademicYearRepository {
  return {
    list: (schoolId) =>
      client.academicYear.findMany({ where: { schoolId }, orderBy: { startDate: "desc" } }),
    findById: (id) => client.academicYear.findUnique({ where: { id } }),
    findByName: (schoolId, name) =>
      client.academicYear.findUnique({ where: { schoolId_name: { schoolId, name } } }),
    findActive: (schoolId) =>
      client.academicYear.findFirst({ where: { schoolId, status: "ACTIVE" } }),
    create: (input) => client.academicYear.create({ data: input }),
    // Include only provided fields (undefined = leave unchanged) — exactOptionalPropertyTypes.
    update: (id, data) =>
      client.academicYear.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.startDate !== undefined ? { startDate: data.startDate } : {}),
          ...(data.endDate !== undefined ? { endDate: data.endDate } : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
        },
      }),
    delete: async (id) => {
      await client.academicYear.delete({ where: { id } });
    },
  };
}
