import { PERMISSIONS } from "@repo/constants";
import type { SchoolSettingsDto } from "@repo/types";

import { assertCan } from "../../authorization";
import type { ServiceContext } from "../../context";

import { mapSchoolSettings } from "./mappers";
import { recordAudit } from "./scope";

/** Read the school profile + academic defaults + numbering. Admin-only (ADR-024 §3). */
export async function getSchoolSettings(ctx: ServiceContext): Promise<SchoolSettingsDto> {
  assertCan(ctx.user, PERMISSIONS.SETTINGS_MANAGE);
  return mapSchoolSettings(await ctx.repositories.schoolSettings.getBySchool(ctx.user.schoolId));
}

export interface UpdateSchoolSettingsInput {
  contactEmail?: string | null | undefined;
  contactPhone?: string | null | undefined;
  website?: string | null | undefined;
  principalName?: string | null | undefined;
  academicYearStartMonth?: number | null | undefined;
  invoicePrefix?: string | null | undefined;
  certificatePrefix?: string | null | undefined;
  /** Reserved compound defaults (report-card/attendance/grading) — inert in v1 (ADR-024 §5). */
  academicDefaults?: Record<string, unknown> | undefined;
}

/**
 * Patch the single school-settings row (profile + academic defaults + numbering).
 * Admin-only. Audited. Numbering/academic values are STORED but read by no frozen
 * engine in v1 (ADR-024 §5) — configuration influences only future actions.
 */
export async function updateSchoolSettings(
  ctx: ServiceContext,
  input: UpdateSchoolSettingsInput,
): Promise<SchoolSettingsDto> {
  assertCan(ctx.user, PERMISSIONS.SETTINGS_MANAGE);
  const { academicDefaults, ...scalars } = input;
  const saved = await ctx.withTransaction(async (repos) => {
    const row = await repos.schoolSettings.upsert(ctx.user.schoolId, {
      ...scalars,
      ...(academicDefaults !== undefined ? { academicDefaults } : {}),
      updatedByUserId: ctx.user.userId,
    });
    await recordAudit(ctx, repos, {
      action: "SCHOOL_SETTINGS_UPDATE",
      entityType: "SchoolSettings",
      entityId: row.id,
      // read-back from the saved row (clean string|number|null; academicDefaults JSON omitted).
      after: {
        contactEmail: row.contactEmail,
        contactPhone: row.contactPhone,
        website: row.website,
        principalName: row.principalName,
        academicYearStartMonth: row.academicYearStartMonth,
        invoicePrefix: row.invoicePrefix,
        certificatePrefix: row.certificatePrefix,
      },
    });
    return row;
  });
  return mapSchoolSettings(saved);
}
