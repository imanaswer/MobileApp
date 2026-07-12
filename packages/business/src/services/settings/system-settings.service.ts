import { PERMISSIONS, type LocaleCode } from "@repo/constants";
import type { SystemSettingsDto } from "@repo/types";

import { TO_DB_LOCALE } from "../../auth/principal";
import { assertCan } from "../../authorization";
import type { ServiceContext } from "../../context";

import { mapSystemSettings } from "./mappers";
import { recordAudit } from "./scope";

/** Read the localization/technical defaults. Admin-only (ADR-024 §3). */
export async function getSystemSettings(ctx: ServiceContext): Promise<SystemSettingsDto> {
  assertCan(ctx.user, PERMISSIONS.SETTINGS_MANAGE);
  return mapSystemSettings(await ctx.repositories.systemSettings.getBySchool(ctx.user.schoolId));
}

export interface UpdateSystemSettingsInput {
  timezone?: string | undefined;
  language?: LocaleCode | undefined;
  theme?: string | undefined;
  workingDays?: number[] | undefined;
}

/**
 * Patch the single system-settings row (timezone/language/theme/working-week).
 * Admin-only. Audited. These are STORED but read by no frozen engine in v1 (ADR-024
 * §5 — IST stays hard-coded); new M16 surfaces (app shell) may read theme/language.
 */
export async function updateSystemSettings(
  ctx: ServiceContext,
  input: UpdateSystemSettingsInput,
): Promise<SystemSettingsDto> {
  assertCan(ctx.user, PERMISSIONS.SETTINGS_MANAGE);
  const saved = await ctx.withTransaction(async (repos) => {
    const row = await repos.systemSettings.upsert(ctx.user.schoolId, {
      ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
      ...(input.language !== undefined ? { language: TO_DB_LOCALE[input.language] } : {}),
      ...(input.theme !== undefined ? { theme: input.theme } : {}),
      ...(input.workingDays !== undefined ? { workingDays: input.workingDays } : {}),
      updatedByUserId: ctx.user.userId,
    });
    await recordAudit(ctx, repos, {
      action: "SYSTEM_SETTINGS_UPDATE",
      entityType: "SystemSettings",
      entityId: row.id,
      after: {
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
        ...(input.language !== undefined ? { language: input.language } : {}),
        ...(input.theme !== undefined ? { theme: input.theme } : {}),
        ...(input.workingDays !== undefined ? { workingDays: input.workingDays.join(",") } : {}),
      },
    });
    return row;
  });
  return mapSystemSettings(saved);
}
