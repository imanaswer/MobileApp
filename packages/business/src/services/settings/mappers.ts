import type { LocaleCode } from "@repo/constants";
import type { BrandingSettings, SchoolSettings, SystemSettings } from "@repo/db";
import type { BrandingDto, IsoUtcString, SchoolSettingsDto, SystemSettingsDto } from "@repo/types";

import { TO_APP_LOCALE } from "../../auth/principal";

const iso = (d: Date): IsoUtcString => d.toISOString() as IsoUtcString;

/** System defaults for a school with no row yet — mirror the DB column defaults (ADR-024 §4). */
export const SYSTEM_DEFAULTS = {
  timezone: "Asia/Kolkata",
  language: "en" as LocaleCode, // DB default EN → app "en" (TO_APP_LOCALE)
  theme: "light",
  workingDays: [1, 2, 3, 4, 5],
} as const;

export function mapBranding(b: BrandingSettings | null): BrandingDto {
  return {
    logoPath: b?.logoPath ?? null,
    primaryColor: b?.primaryColor ?? null,
    secondaryColor: b?.secondaryColor ?? null,
    displayName: b?.displayName ?? null,
    updatedAt: b ? iso(b.updatedAt) : null,
  };
}

export function mapSchoolSettings(s: SchoolSettings | null): SchoolSettingsDto {
  return {
    contactEmail: s?.contactEmail ?? null,
    contactPhone: s?.contactPhone ?? null,
    website: s?.website ?? null,
    principalName: s?.principalName ?? null,
    academicYearStartMonth: s?.academicYearStartMonth ?? null,
    invoicePrefix: s?.invoicePrefix ?? null,
    certificatePrefix: s?.certificatePrefix ?? null,
    academicDefaults: (s?.academicDefaults as Record<string, unknown> | null) ?? null,
    updatedAt: s ? iso(s.updatedAt) : null,
  };
}

export function mapSystemSettings(s: SystemSettings | null): SystemSettingsDto {
  return {
    timezone: s?.timezone ?? SYSTEM_DEFAULTS.timezone,
    language: s ? TO_APP_LOCALE[s.language] : SYSTEM_DEFAULTS.language,
    theme: s?.theme ?? SYSTEM_DEFAULTS.theme,
    workingDays: s?.workingDays ?? [...SYSTEM_DEFAULTS.workingDays],
    updatedAt: s ? iso(s.updatedAt) : null,
  };
}
