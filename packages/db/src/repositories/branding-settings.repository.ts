import type { BrandingSettings } from "@prisma/client";

import type { DbClient } from "../db-client";

export type { BrandingSettings };

/** Patch input for the single per-school branding row (ADR-024). All optional. */
export interface UpsertBrandingSettingsInput {
  logoPath?: string | null | undefined;
  primaryColor?: string | null | undefined;
  secondaryColor?: string | null | undefined;
  displayName?: string | null | undefined;
  updatedByUserId?: string | null | undefined;
}

/** Persistence for `BrandingSettings` (ADR-003/024). One row per school; no auth here. */
export interface BrandingSettingsRepository {
  getBySchool(schoolId: string): Promise<BrandingSettings | null>;
  upsert(schoolId: string, input: UpsertBrandingSettingsInput): Promise<BrandingSettings>;
}

export function createBrandingSettingsRepository(client: DbClient): BrandingSettingsRepository {
  return {
    getBySchool: (schoolId) => client.brandingSettings.findUnique({ where: { schoolId } }),

    upsert: (schoolId, input) => {
      // Conditional spreads strip `undefined` (Prisma rejects it under exactOptional);
      // `null` passes through to clear a value (the document-template repo pattern).
      const data = {
        ...(input.logoPath !== undefined ? { logoPath: input.logoPath } : {}),
        ...(input.primaryColor !== undefined ? { primaryColor: input.primaryColor } : {}),
        ...(input.secondaryColor !== undefined ? { secondaryColor: input.secondaryColor } : {}),
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
        ...(input.updatedByUserId !== undefined ? { updatedByUserId: input.updatedByUserId } : {}),
      };
      return client.brandingSettings.upsert({
        where: { schoolId },
        create: { schoolId, ...data },
        update: { ...data },
      });
    },
  };
}
