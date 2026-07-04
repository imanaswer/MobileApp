import type { Principal } from "@repo/business";
import { describe, expect, it } from "vitest";

import type { Context } from "../context";
import { appRouter } from "../root";
import { createCallerFactory } from "../trpc";

const createCaller = createCallerFactory(appRouter);

const active: Principal = { userId: "u-1", schoolId: "s-1", role: "PARENT", status: "ACTIVE" };
const invited: Principal = { ...active, status: "INVITED" };
const disabled: Principal = { ...active, status: "DISABLED" };
const superAdmin: Principal = { ...active, userId: "u-super", role: "SUPER_ADMIN" };

describe("auth.me — route protection", () => {
  it("returns the principal for an ACTIVE user", async () => {
    const caller = createCaller({ user: active });
    await expect(caller.auth.me()).resolves.toEqual(active);
  });

  it("returns the principal for an INVITED user (onboarding gate allows it)", async () => {
    const caller = createCaller({ user: invited });
    await expect(caller.auth.me()).resolves.toEqual(invited);
  });

  it("rejects an unauthenticated caller (UNAUTHORIZED)", async () => {
    const caller = createCaller({ user: null } satisfies Context);
    await expect(caller.auth.me()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects a DISABLED account (FORBIDDEN — mid-session revocation)", async () => {
    const caller = createCaller({ user: disabled });
    await expect(caller.auth.me()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("auth.registerProfile — onboarding gate", () => {
  it("rejects an unauthenticated caller (UNAUTHORIZED)", async () => {
    const caller = createCaller({ user: null });
    await expect(caller.auth.registerProfile()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects a DISABLED account before any activation runs (FORBIDDEN)", async () => {
    const caller = createCaller({ user: disabled });
    await expect(caller.auth.registerProfile()).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Account is disabled",
    });
  });
});

describe("protectedProcedure — ACTIVE-only gate (auth.updateProfile)", () => {
  it("rejects an unauthenticated caller (UNAUTHORIZED)", async () => {
    const caller = createCaller({ user: null });
    await expect(caller.auth.updateProfile({ locale: "en" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("rejects an INVITED (not yet activated) account — onboarding must go through registerProfile", async () => {
    const caller = createCaller({ user: invited });
    await expect(caller.auth.updateProfile({ locale: "en" })).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Account is not activated",
    });
  });

  it("rejects a DISABLED account despite a valid JWT (mid-session revocation)", async () => {
    const caller = createCaller({ user: disabled });
    await expect(caller.auth.updateProfile({ locale: "en" })).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Account is disabled",
    });
  });
});

describe("input validation (Zod → BAD_REQUEST)", () => {
  it("rejects an unsupported locale", async () => {
    const caller = createCaller({ user: active });
    await expect(
      // @ts-expect-error — deliberately invalid input
      caller.auth.updateProfile({ locale: "hi" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects a role outside the fixed set", async () => {
    const caller = createCaller({ user: superAdmin });
    await expect(
      // @ts-expect-error — deliberately invalid input
      caller.auth.setRole({ userId: "u-1", role: "STUDENT" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("DomainError → TRPCError mapping (business ForbiddenError surfaces as FORBIDDEN)", () => {
  it("a PARENT calling the admin setRole gets FORBIDDEN, not a 500", async () => {
    const caller = createCaller({ user: active });
    await expect(caller.auth.setRole({ userId: "u-2", role: "TEACHER" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("a PARENT calling disableUser/enableUser gets FORBIDDEN", async () => {
    const caller = createCaller({ user: active });
    await expect(caller.auth.disableUser({ userId: "u-2" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(caller.auth.enableUser({ userId: "u-2" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("even a SUPER_ADMIN cannot disable their own account (FORBIDDEN)", async () => {
    const caller = createCaller({ user: superAdmin });
    await expect(caller.auth.disableUser({ userId: superAdmin.userId })).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "You cannot disable your own account",
    });
  });
});
