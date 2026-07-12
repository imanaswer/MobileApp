import { ForbiddenError } from "@repo/core";
import type { BrandingSettings, Repositories, SchoolSettings, SystemSettings } from "@repo/db";
import { createNotificationService } from "@repo/notifications";
import { describe, expect, it, vi } from "vitest";

import type { Principal } from "../../authorization";
import type { ServiceContext } from "../../context";

import { getPublicSettings, updateBranding } from "./branding.service";
import { updateSchoolSettings } from "./school-settings.service";
import { getSystemSettings, updateSystemSettings } from "./system-settings.service";

const admin: Principal = {
  userId: "u-admin",
  schoolId: "s-1",
  role: "OFFICE_ADMIN",
  status: "ACTIVE",
};
const teacher: Principal = { userId: "u-t", schoolId: "s-1", role: "TEACHER", status: "ACTIVE" };
const parent: Principal = { userId: "u-p", schoolId: "s-1", role: "PARENT", status: "ACTIVE" };

const now = new Date("2026-06-01T00:00:00.000Z");

/** Stateful single-row repos so upsert semantics are exercised for real. */
function makeRepos(
  seed: { branding?: Partial<BrandingSettings>; system?: Partial<SystemSettings> } = {},
) {
  let branding: BrandingSettings | null = seed.branding
    ? ({
        id: "b1",
        schoolId: "s-1",
        logoPath: null,
        primaryColor: null,
        secondaryColor: null,
        displayName: null,
        updatedByUserId: null,
        createdAt: now,
        updatedAt: now,
        ...seed.branding,
      } as BrandingSettings)
    : null;
  let system: SystemSettings | null = seed.system
    ? ({
        id: "y1",
        schoolId: "s-1",
        timezone: "Asia/Kolkata",
        language: "EN",
        theme: "light",
        workingDays: [1, 2, 3, 4, 5],
        updatedByUserId: null,
        createdAt: now,
        updatedAt: now,
        ...seed.system,
      } as SystemSettings)
    : null;
  let school: SchoolSettings | null = null;
  return {
    audit: { record: vi.fn(async (): Promise<void> => undefined) },
    brandingSettings: {
      getBySchool: vi.fn(async () => branding),
      upsert: vi.fn(async (_s: string, input: Partial<BrandingSettings>) => {
        branding = {
          ...(branding ?? ({ id: "b1", schoolId: "s-1", createdAt: now } as BrandingSettings)),
          ...input,
          updatedAt: now,
        } as BrandingSettings;
        return branding;
      }),
    },
    systemSettings: {
      getBySchool: vi.fn(async () => system),
      upsert: vi.fn(async (_s: string, input: Partial<SystemSettings>) => {
        system = {
          ...(system ??
            ({
              id: "y1",
              schoolId: "s-1",
              timezone: "Asia/Kolkata",
              language: "EN",
              theme: "light",
              workingDays: [1, 2, 3, 4, 5],
              createdAt: now,
            } as SystemSettings)),
          ...input,
          updatedAt: now,
        } as SystemSettings;
        return system;
      }),
    },
    schoolSettings: {
      getBySchool: vi.fn(async () => school),
      upsert: vi.fn(async (_s: string, input: Partial<SchoolSettings>) => {
        school = {
          ...(school ?? ({ id: "s1", schoolId: "s-1", createdAt: now } as SchoolSettings)),
          ...input,
          updatedAt: now,
        } as SchoolSettings;
        return school;
      }),
    },
  };
}

function makeCtx(user: Principal, repos: ReturnType<typeof makeRepos>) {
  const repositories = repos as unknown as Repositories;
  const ctx: ServiceContext = {
    user,
    repositories,
    notifications: createNotificationService([]),
    withTransaction: <T>(fn: (r: Repositories) => Promise<T>) => fn(repositories),
  };
  return { ctx, repos };
}

describe("settings configuration (ADR-024)", () => {
  it("updateBranding: admin upsert persists + audits; teacher & parent denied", async () => {
    const { ctx, repos } = makeCtx(admin, makeRepos());
    const out = await updateBranding(ctx, { displayName: "My School", primaryColor: "#111" });
    expect(out.displayName).toBe("My School");
    expect(out.primaryColor).toBe("#111");
    expect(repos.audit.record).toHaveBeenCalledTimes(1);

    for (const role of [teacher, parent]) {
      const { ctx: c } = makeCtx(role, makeRepos());
      await expect(updateBranding(c, { displayName: "x" })).rejects.toBeInstanceOf(ForbiddenError);
    }
  });

  it("getPublicSettings: any authenticated user reads branding + theme/language, never admin config", async () => {
    const repos = makeRepos({
      branding: { displayName: "Public Name" },
      system: { theme: "dark", language: "ML" },
    });
    for (const role of [admin, teacher, parent]) {
      const { ctx } = makeCtx(role, repos);
      const pub = await getPublicSettings(ctx);
      expect(pub.branding.displayName).toBe("Public Name");
      expect(pub.theme).toBe("dark");
      expect(pub.language).toBe("ml"); // DB ML → app "ml"
      // the projection type carries no school-profile/numbering keys — admin-only stays admin-only
      expect(Object.keys(pub)).toEqual(["branding", "theme", "language"]);
    }
  });

  it("system settings: admin-only read; locale round-trips app<->DB; defaults when no row", async () => {
    const { ctx: adminCtx } = makeCtx(admin, makeRepos());
    const defaults = await getSystemSettings(adminCtx);
    expect(defaults).toMatchObject({
      timezone: "Asia/Kolkata",
      language: "en",
      theme: "light",
      workingDays: [1, 2, 3, 4, 5],
    });

    const { ctx, repos } = makeCtx(admin, makeRepos());
    await updateSystemSettings(ctx, {
      language: "ml",
      theme: "dark",
      workingDays: [1, 2, 3, 4, 5, 6],
    });
    expect(repos.systemSettings.upsert).toHaveBeenCalledWith(
      "s-1",
      expect.objectContaining({ language: "ML" }),
    );
    const after = await getSystemSettings(ctx);
    expect(after.language).toBe("ml");
    expect(after.theme).toBe("dark");

    // teacher/parent cannot read admin-only system config
    for (const role of [teacher, parent]) {
      const { ctx: c } = makeCtx(role, makeRepos());
      await expect(getSystemSettings(c)).rejects.toBeInstanceOf(ForbiddenError);
    }
  });

  it("updateSchoolSettings: admin-only; numbering/academic stored (inert in v1)", async () => {
    const { ctx, repos } = makeCtx(admin, makeRepos());
    const out = await updateSchoolSettings(ctx, {
      invoicePrefix: "INV",
      certificatePrefix: "CERT",
      academicYearStartMonth: 6,
    });
    expect(out.invoicePrefix).toBe("INV");
    expect(out.academicYearStartMonth).toBe(6);
    expect(repos.audit.record).toHaveBeenCalledTimes(1);

    const { ctx: c } = makeCtx(parent, makeRepos());
    await expect(updateSchoolSettings(c, { invoicePrefix: "x" })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
