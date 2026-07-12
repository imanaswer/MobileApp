import type { Locale, SystemSettings } from "@prisma/client";

import type { DbClient } from "../db-client";

export type { SystemSettings };

/** Patch input for the single per-school system row (ADR-024 §3). All optional. */
export interface UpsertSystemSettingsInput {
  timezone?: string | undefined;
  language?: Locale | undefined;
  theme?: string | undefined;
  workingDays?: number[] | undefined;
  updatedByUserId?: string | null | undefined;
}

/** Persistence for `SystemSettings` (ADR-003/024). One row per school; no auth here. */
export interface SystemSettingsRepository {
  getBySchool(schoolId: string): Promise<SystemSettings | null>;
  upsert(schoolId: string, input: UpsertSystemSettingsInput): Promise<SystemSettings>;
}

export function createSystemSettingsRepository(client: DbClient): SystemSettingsRepository {
  return {
    getBySchool: (schoolId) => client.systemSettings.findUnique({ where: { schoolId } }),

    upsert: (schoolId, input) => {
      // Conditional spreads strip `undefined` (Prisma rejects it under exactOptional).
      const data = {
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
        ...(input.language !== undefined ? { language: input.language } : {}),
        ...(input.theme !== undefined ? { theme: input.theme } : {}),
        ...(input.workingDays !== undefined ? { workingDays: input.workingDays } : {}),
        ...(input.updatedByUserId !== undefined ? { updatedByUserId: input.updatedByUserId } : {}),
      };
      return client.systemSettings.upsert({
        where: { schoolId },
        create: { schoolId, ...data },
        update: { ...data },
      });
    },
  };
}
