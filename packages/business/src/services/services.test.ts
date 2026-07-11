import { ForbiddenError, NotFoundError } from "@repo/core";
import type { Repositories, User, UserRepository } from "@repo/db";
import { createNotificationService } from "@repo/notifications";
import { describe, expect, it, vi } from "vitest";

import type { Principal } from "../authorization";
import type { ServiceContext } from "../context";

import { disableUser, enableUser, setRole } from "./admin";
import { updateProfile } from "./profile";

const superAdmin: Principal = {
  userId: "u-super",
  schoolId: "s-1",
  role: "SUPER_ADMIN",
  status: "ACTIVE",
};
const parent: Principal = { userId: "u-parent", schoolId: "s-1", role: "PARENT", status: "ACTIVE" };

const baseUser: User = {
  id: "u-target",
  schoolId: "s-1",
  role: "PARENT",
  status: "ACTIVE",
  phone: "+911234567890",
  email: null,
  locale: "EN",
  lastLoginAt: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

function makeCtx(user: Principal, repoUser: User | null) {
  const current = repoUser;
  const users: UserRepository = {
    findById: vi.fn(async (): Promise<User | null> => current),
    create: vi.fn(async (): Promise<User> => baseUser),
    activate: vi.fn(async (): Promise<User> => baseUser),
    touchLastLogin: vi.fn(async (): Promise<User> => baseUser),
    setRole: vi.fn(async (_id: string, role: User["role"]): Promise<User> => ({
      ...(current ?? baseUser),
      role,
    })),
    setStatus: vi.fn(async (_id: string, status: User["status"]): Promise<User> => ({
      ...(current ?? baseUser),
      status,
    })),
    updateLocale: vi.fn(async (_id: string, locale: User["locale"]): Promise<User> => ({
      ...(current ?? baseUser),
      locale,
    })),
    listBySchool: vi.fn(async (): Promise<User[]> => (current ? [current] : [])),
  };
  const audit = { record: vi.fn(async (): Promise<void> => undefined) };
  // These M1 tests exercise only users/audit; widen to the (M2-extended) aggregate.
  const repositories = { users, audit } as unknown as Repositories;
  const ctx: ServiceContext = {
    user,
    repositories,
    notifications: createNotificationService([]),
    withTransaction: <T>(fn: (repos: Repositories) => Promise<T>) => fn(repositories),
  };
  return { ctx, users, audit };
}

describe("updateProfile", () => {
  it("updates the caller's locale (UI 'ml' → DB 'ML') and returns the profile", async () => {
    const { ctx, users } = makeCtx(parent, baseUser);
    const profile = await updateProfile(ctx, { locale: "ml" });
    expect(users.updateLocale).toHaveBeenCalledWith("u-parent", "ML");
    expect(profile.locale).toBe("ml");
  });
});

describe("setRole", () => {
  it("changes the role and writes an audit row (SUPER_ADMIN)", async () => {
    const { ctx, users, audit } = makeCtx(superAdmin, baseUser);
    const profile = await setRole(ctx, "u-target", "TEACHER");
    expect(users.setRole).toHaveBeenCalledWith("u-target", "TEACHER");
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "USER_SET_ROLE", entityId: "u-target" }),
    );
    expect(profile.role).toBe("TEACHER");
  });

  it("denies a non-admin (ForbiddenError, no writes)", async () => {
    const { ctx, users } = makeCtx(parent, baseUser);
    await expect(setRole(ctx, "u-target", "TEACHER")).rejects.toThrow(ForbiddenError);
    expect(users.setRole).not.toHaveBeenCalled();
  });

  it("throws NotFoundError for a missing target", async () => {
    const { ctx } = makeCtx(superAdmin, null);
    await expect(setRole(ctx, "ghost", "TEACHER")).rejects.toThrow(NotFoundError);
  });
});

describe("disableUser / enableUser", () => {
  it("disables an account and audits it (history preserved — status flip only)", async () => {
    const { ctx, users, audit } = makeCtx(superAdmin, baseUser);
    const profile = await disableUser(ctx, "u-target");
    expect(users.setStatus).toHaveBeenCalledWith("u-target", "DISABLED");
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "USER_DISABLE" }));
    expect(profile.status).toBe("DISABLED");
  });

  it("refuses to disable your own account", async () => {
    const { ctx } = makeCtx(superAdmin, baseUser);
    await expect(disableUser(ctx, "u-super")).rejects.toThrow(ForbiddenError);
  });

  it("re-enables a disabled account (→ ACTIVE) and audits it", async () => {
    const { ctx, users, audit } = makeCtx(superAdmin, { ...baseUser, status: "DISABLED" });
    const profile = await enableUser(ctx, "u-target");
    expect(users.setStatus).toHaveBeenCalledWith("u-target", "ACTIVE");
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "USER_ENABLE" }));
    expect(profile.status).toBe("ACTIVE");
  });
});
