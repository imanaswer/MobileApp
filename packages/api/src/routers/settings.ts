import {
  brandingLogoUploadUrl,
  brandingLogoUrl,
  createServiceContext,
  getBranding,
  getPublicSettings,
  getSchoolSettings,
  getSystemSettings,
  updateBranding,
  updateSchoolSettings,
  updateSystemSettings,
} from "@repo/business";
import {
  brandingLogoUploadUrlInput,
  updateBrandingInput,
  updateSchoolSettingsInput,
  updateSystemSettingsInput,
} from "@repo/validation";

import { protectedProcedure, router, storageProcedure } from "../trpc";

/**
 * School Administration & Configuration procedures (M16, ADR-024). Thin transport
 * only — validate (Zod) then delegate; the business service enforces the single
 * `settings:manage` write permission, the role-shaped read projection (public vs
 * admin-only), single-row upsert, and in-tx audit. No logic, no role strings, no Prisma.
 */

/** settingsService — school profile + academic defaults + numbering (admin), plus the public read. */
export const settingsRouter = router({
  /** The role-shaped PUBLIC projection: branding + theme/language. Any authenticated user. */
  getPublic: protectedProcedure.query(({ ctx }) =>
    getPublicSettings(createServiceContext(ctx.user)),
  ),
  /** School profile + academic defaults + numbering. Admin-only. */
  get: protectedProcedure.query(({ ctx }) => getSchoolSettings(createServiceContext(ctx.user))),
  /** Patch the school-settings row. Admin-only. Audited. */
  update: protectedProcedure
    .input(updateSchoolSettingsInput)
    .mutation(({ ctx, input }) => updateSchoolSettings(createServiceContext(ctx.user), input)),
});

/** brandingService — logo / colours / display name + logo storage. */
export const brandingRouter = router({
  /** The branding row (any authenticated user — branding is broadly readable). */
  get: protectedProcedure.query(({ ctx }) => getBranding(createServiceContext(ctx.user))),
  /** Patch branding. Admin-only. Audited. */
  update: protectedProcedure
    .input(updateBrandingInput)
    .mutation(({ ctx, input }) => updateBranding(createServiceContext(ctx.user), input)),
  /** Mint a one-time signed UPLOAD URL for the logo. Admin-only (authz in the service first). */
  logoUploadUrl: storageProcedure
    .input(brandingLogoUploadUrlInput)
    .mutation(({ ctx, input }) =>
      brandingLogoUploadUrl(createServiceContext(ctx.user), ctx.storage, input.fileName),
    ),
  /** A short-lived signed READ URL for the current logo. Any authenticated user. */
  logoUrl: storageProcedure.mutation(({ ctx }) =>
    brandingLogoUrl(createServiceContext(ctx.user), ctx.storage),
  ),
});

/** configurationService — localization/technical defaults (timezone/language/theme/working-week). */
export const configurationRouter = router({
  /** Read the system settings. Admin-only. */
  get: protectedProcedure.query(({ ctx }) => getSystemSettings(createServiceContext(ctx.user))),
  /** Patch the system-settings row. Admin-only. Audited. */
  update: protectedProcedure
    .input(updateSystemSettingsInput)
    .mutation(({ ctx, input }) => updateSystemSettings(createServiceContext(ctx.user), input)),
});
