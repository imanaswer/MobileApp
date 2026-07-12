import type { Principal } from "@repo/business";
import { describe, expect, it } from "vitest";

import { appRouter } from "../root";
import { createCallerFactory } from "../trpc";

const createCaller = createCallerFactory(appRouter);

/**
 * Transport-layer behaviour for the M16 settings/branding/configuration routers
 * (ADR-024): route protection, the permission matrix that fails in the service
 * BEFORE any repository call (assertCan(settings:manage) → FORBIDDEN), the storage
 * precondition (storageProcedure → PRECONDITION_FAILED when no StoragePort is wired),
 * and Zod validation (BAD_REQUEST, before the resolver). Persistence, the public
 * projection and locale round-trip are unit-tested in @repo/business (settings.service).
 * Only paths that short-circuit before the DB are exercised here (no live repo).
 */
const admin: Principal = { userId: "u-a", schoolId: "s-1", role: "OFFICE_ADMIN", status: "ACTIVE" };
const teacher: Principal = { userId: "u-t", schoolId: "s-1", role: "TEACHER", status: "ACTIVE" };
const parent: Principal = { userId: "u-p", schoolId: "s-1", role: "PARENT", status: "ACTIVE" };
const disabled: Principal = { ...admin, status: "DISABLED" };

describe("settings routers — route protection", () => {
  it("rejects an unauthenticated caller (UNAUTHORIZED)", async () => {
    await expect(createCaller({ user: null }).settings.getPublic()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
  it("rejects a DISABLED account (FORBIDDEN)", async () => {
    await expect(createCaller({ user: disabled }).settings.get()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("settings routers — permission matrix (before any repo call)", () => {
  it("a TEACHER cannot read admin school settings (FORBIDDEN)", async () => {
    await expect(createCaller({ user: teacher }).settings.get()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
  it("a PARENT cannot read admin system settings (FORBIDDEN)", async () => {
    await expect(createCaller({ user: parent }).configuration.get()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
  it("a TEACHER cannot update branding (FORBIDDEN — manage-only)", async () => {
    await expect(
      createCaller({ user: teacher }).branding.update({ displayName: "X" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("a TEACHER cannot update school settings (FORBIDDEN)", async () => {
    await expect(
      createCaller({ user: teacher }).settings.update({ principalName: "X" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("a PARENT cannot update system settings (FORBIDDEN)", async () => {
    await expect(
      createCaller({ user: parent }).configuration.update({ theme: "dark" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("settings routers — Zod validation (BAD_REQUEST before the resolver)", () => {
  it("rejects a non-enum theme", async () => {
    await expect(
      createCaller({ user: admin }).configuration.update({ theme: "neon" as never }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("rejects a working day out of range", async () => {
    await expect(
      createCaller({ user: admin }).configuration.update({ workingDays: [9] }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("rejects a malformed contact email", async () => {
    await expect(
      createCaller({ user: admin }).settings.update({ contactEmail: "not-an-email" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("rejects a non-hex primary colour", async () => {
    await expect(
      createCaller({ user: admin }).branding.update({ primaryColor: "red" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("settings routers — storage precondition", () => {
  it("branding.logoUploadUrl requires a wired StoragePort (PRECONDITION_FAILED)", async () => {
    await expect(
      createCaller({ user: admin }).branding.logoUploadUrl({ fileName: "logo.png" }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});
