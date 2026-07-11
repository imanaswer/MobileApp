import { ForbiddenError, NotFoundError } from "@repo/core";
import type { Repositories, User, UserRepository } from "@repo/db";
import { createNotificationService } from "@repo/notifications";
import { describe, expect, it, vi } from "vitest";

import type { Principal } from "../authorization";
import type { ServiceContext } from "../context";

import { activateUser, resolvePrincipal } from "./session";

const baseUser: User = {
  id: "u-1",
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

const principal: Principal = { userId: "u-1", schoolId: "s-1", role: "PARENT", status: "INVITED" };

function fakeUsers(user: User | null): UserRepository {
  return {
    findById: vi.fn(async (): Promise<User | null> => user),
    create: vi.fn(async (): Promise<User> => baseUser),
    activate: vi.fn(async (): Promise<User> => ({
      ...(user ?? baseUser),
      status: "ACTIVE",
      lastLoginAt: new Date(),
    })),
    touchLastLogin: vi.fn(async (): Promise<User> => ({
      ...(user ?? baseUser),
      lastLoginAt: new Date(),
    })),
    setRole: vi.fn(async (_id: string, role: User["role"]): Promise<User> => ({
      ...(user ?? baseUser),
      role,
    })),
    setStatus: vi.fn(async (_id: string, status: User["status"]): Promise<User> => ({
      ...(user ?? baseUser),
      status,
    })),
    updateLocale: vi.fn(async (_id: string, locale: User["locale"]): Promise<User> => ({
      ...(user ?? baseUser),
      locale,
    })),
    listBySchool: vi.fn(async (): Promise<User[]> => (user ? [user] : [])),
  };
}

/** A fake ServiceContext with a synchronous pass-through transaction. */
function makeCtx(user: Principal, dbUser: User | null, auditImpl?: () => Promise<void>) {
  const users = fakeUsers(dbUser);
  const audit = { record: vi.fn(auditImpl ?? (async (): Promise<void> => undefined)) };
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

describe("resolvePrincipal", () => {
  it("maps a DB user to a Principal (role/schoolId/status from DB)", async () => {
    const principalResult = await resolvePrincipal(
      "u-1",
      fakeUsers({ ...baseUser, role: "TEACHER" }),
    );
    expect(principalResult).toEqual({
      userId: "u-1",
      schoolId: "s-1",
      role: "TEACHER",
      status: "ACTIVE",
      locale: "en",
    });
  });

  it("returns null when the identity has no profile", async () => {
    expect(await resolvePrincipal("ghost", fakeUsers(null))).toBeNull();
  });
});

describe("activateUser", () => {
  it("activates an INVITED account and writes a USER_ACTIVATED audit row (same transaction)", async () => {
    const { ctx, users, audit } = makeCtx(principal, { ...baseUser, status: "INVITED" });
    const result = await activateUser(ctx);
    expect(users.activate).toHaveBeenCalledWith("u-1");
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "USER_ACTIVATED",
        entityType: "User",
        entityId: "u-1",
        actorUserId: "u-1",
        schoolId: "s-1",
      }),
    );
    expect(result.status).toBe("ACTIVE");
  });

  it("is idempotent for an ACTIVE account (touch lastLoginAt, NOT re-audited)", async () => {
    const { ctx, users, audit } = makeCtx(principal, { ...baseUser, status: "ACTIVE" });
    await activateUser(ctx);
    expect(users.touchLastLogin).toHaveBeenCalledWith("u-1");
    expect(users.activate).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("rejects a DISABLED account (history preserved, no delete)", async () => {
    const { ctx } = makeCtx(principal, { ...baseUser, status: "DISABLED" });
    await expect(activateUser(ctx)).rejects.toThrow(ForbiddenError);
  });

  it("rejects when no profile exists", async () => {
    const { ctx } = makeCtx(principal, null);
    await expect(activateUser(ctx)).rejects.toThrow(NotFoundError);
  });

  it("rolls back (rejects) if the audit write fails — never activated without an audit record", async () => {
    const failingAudit = async (): Promise<void> => {
      throw new Error("audit unavailable");
    };
    const { ctx } = makeCtx(principal, { ...baseUser, status: "INVITED" }, failingAudit);
    // The audit failure propagates out of the transaction, so prisma.$transaction rolls back.
    await expect(activateUser(ctx)).rejects.toThrow("audit unavailable");
  });
});
