import { PERMISSIONS, STORAGE_BUCKETS } from "@repo/constants";
import { ConflictError } from "@repo/core";
import type { BrandingDto, PublicSettingsDto } from "@repo/types";

import { assertCan } from "../../authorization";
import type { ServiceContext } from "../../context";
import type { StoragePort } from "../people/document-storage.service";

import { mapBranding, mapSystemSettings } from "./mappers";
import { recordAudit } from "./scope";

/** Branding logo signed-read URL lifetime — low-sensitivity display asset (ADR-024). */
const LOGO_URL_TTL_SECONDS = 300;

// ---------------------------------------------------------------------------
// Reads — the role-shaped PUBLIC projection (ADR-024 §6). Any authenticated user.
// ---------------------------------------------------------------------------

/**
 * The public settings any authenticated user may read (ADR-024 §6): branding +
 * the display-relevant system defaults (theme/language). This is the "teachers read
 * selected public settings" / "parents read branding" projection — it NEVER exposes
 * admin-only school profile / numbering / academic config.
 */
export async function getPublicSettings(ctx: ServiceContext): Promise<PublicSettingsDto> {
  const [branding, system] = await Promise.all([
    ctx.repositories.brandingSettings.getBySchool(ctx.user.schoolId),
    ctx.repositories.systemSettings.getBySchool(ctx.user.schoolId),
  ]);
  const sys = mapSystemSettings(system);
  return { branding: mapBranding(branding), theme: sys.theme, language: sys.language };
}

/** The raw branding row (admin edits from this). Any authenticated user (branding is public). */
export async function getBranding(ctx: ServiceContext): Promise<BrandingDto> {
  return mapBranding(await ctx.repositories.brandingSettings.getBySchool(ctx.user.schoolId));
}

// ---------------------------------------------------------------------------
// Writes — admin-only (settings:manage). Audited upserts on the single row.
// ---------------------------------------------------------------------------

export interface UpdateBrandingInput {
  logoPath?: string | null | undefined;
  primaryColor?: string | null | undefined;
  secondaryColor?: string | null | undefined;
  displayName?: string | null | undefined;
}

/** Update the school branding (name/colours/logo path). Admin-only. Audited. */
export async function updateBranding(
  ctx: ServiceContext,
  input: UpdateBrandingInput,
): Promise<BrandingDto> {
  assertCan(ctx.user, PERMISSIONS.SETTINGS_MANAGE);
  const saved = await ctx.withTransaction(async (repos) => {
    const row = await repos.brandingSettings.upsert(ctx.user.schoolId, {
      ...input,
      updatedByUserId: ctx.user.userId,
    });
    await recordAudit(ctx, repos, {
      action: "BRANDING_UPDATE",
      entityType: "BrandingSettings",
      entityId: row.id,
      after: {
        displayName: row.displayName,
        primaryColor: row.primaryColor,
        secondaryColor: row.secondaryColor,
        logoPath: row.logoPath,
      },
    });
    return row;
  });
  return mapBranding(saved);
}

// ---------------------------------------------------------------------------
// Logo storage — reuse the ADR-004 StoragePort + the private `branding` bucket.
// ---------------------------------------------------------------------------

/** Mint a one-time signed UPLOAD URL for the logo. Admin-only. Path namespaced by school. */
export async function brandingLogoUploadUrl(
  ctx: ServiceContext,
  storage: StoragePort,
  fileName: string,
): Promise<{ storagePath: string; signedUrl: string; token: string }> {
  assertCan(ctx.user, PERMISSIONS.SETTINGS_MANAGE);
  const safeName = fileName.replace(/[^\w.-]+/g, "_").slice(-100);
  const storagePath = `${ctx.user.schoolId}/${crypto.randomUUID()}-${safeName}`;
  const { signedUrl, token } = await storage.createSignedUploadUrl(
    STORAGE_BUCKETS.BRANDING,
    storagePath,
  );
  return { storagePath, signedUrl, token };
}

/** A short-lived signed READ URL for the current logo. Any authenticated user. */
export async function brandingLogoUrl(
  ctx: ServiceContext,
  storage: StoragePort,
): Promise<{ url: string }> {
  const branding = await ctx.repositories.brandingSettings.getBySchool(ctx.user.schoolId);
  if (!branding?.logoPath) {
    throw new ConflictError("No logo has been uploaded");
  }
  const url = await storage.createSignedDownloadUrl(
    STORAGE_BUCKETS.BRANDING,
    branding.logoPath,
    LOGO_URL_TTL_SECONDS,
  );
  return { url };
}
