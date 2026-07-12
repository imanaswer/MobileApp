import type { Prisma, SchoolSettings } from "@prisma/client";

import type { DbClient } from "../db-client";

export type { SchoolSettings };

/** Patch input for the single per-school settings row (ADR-024 §3). All optional. */
export interface UpsertSchoolSettingsInput {
  contactEmail?: string | null | undefined;
  contactPhone?: string | null | undefined;
  website?: string | null | undefined;
  principalName?: string | null | undefined;
  academicYearStartMonth?: number | null | undefined;
  invoicePrefix?: string | null | undefined;
  certificatePrefix?: string | null | undefined;
  /** Reserved JSON escape-hatch (report-card/attendance/grading defaults, ADR-024 §4). */
  academicDefaults?: Record<string, unknown> | undefined;
  updatedByUserId?: string | null | undefined;
}

/** Persistence for `SchoolSettings` (ADR-003/024). One row per school; no auth here. */
export interface SchoolSettingsRepository {
  getBySchool(schoolId: string): Promise<SchoolSettings | null>;
  upsert(schoolId: string, input: UpsertSchoolSettingsInput): Promise<SchoolSettings>;
}

export function createSchoolSettingsRepository(client: DbClient): SchoolSettingsRepository {
  return {
    getBySchool: (schoolId) => client.schoolSettings.findUnique({ where: { schoolId } }),

    upsert: (schoolId, input) => {
      // Conditional spreads strip `undefined` (Prisma rejects it under exactOptional);
      // `null` passes through to clear a value (the document-template repo pattern).
      const data = {
        ...(input.contactEmail !== undefined ? { contactEmail: input.contactEmail } : {}),
        ...(input.contactPhone !== undefined ? { contactPhone: input.contactPhone } : {}),
        ...(input.website !== undefined ? { website: input.website } : {}),
        ...(input.principalName !== undefined ? { principalName: input.principalName } : {}),
        ...(input.academicYearStartMonth !== undefined
          ? { academicYearStartMonth: input.academicYearStartMonth }
          : {}),
        ...(input.invoicePrefix !== undefined ? { invoicePrefix: input.invoicePrefix } : {}),
        ...(input.certificatePrefix !== undefined
          ? { certificatePrefix: input.certificatePrefix }
          : {}),
        ...(input.academicDefaults !== undefined
          ? { academicDefaults: input.academicDefaults as Prisma.InputJsonValue }
          : {}),
        ...(input.updatedByUserId !== undefined ? { updatedByUserId: input.updatedByUserId } : {}),
      };
      return client.schoolSettings.upsert({
        where: { schoolId },
        create: { schoolId, ...data },
        update: { ...data },
      });
    },
  };
}
