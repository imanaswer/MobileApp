import type { Principal } from "@repo/business";
import { describe, expect, it } from "vitest";

import { appRouter } from "../root";
import { createCallerFactory } from "../trpc";

const createCaller = createCallerFactory(appRouter);

/**
 * Transport-layer behaviour for the M11 announcement router (ADR-019): route
 * protection, the author/admin permission gates that fail in the service BEFORE any
 * repository call (assertCan/assertAnnouncementAuthor → FORBIDDEN), and Zod input
 * validation (BAD_REQUEST, before the resolver). Targeting, lifecycle, attachments
 * and audit are unit-tested in @repo/business (announcement.services).
 */
const superAdmin: Principal = {
  userId: "u-super",
  schoolId: "s-1",
  role: "SUPER_ADMIN",
  status: "ACTIVE",
};
const teacher: Principal = {
  userId: "u-teacher",
  schoolId: "s-1",
  role: "TEACHER",
  status: "ACTIVE",
};
const parent: Principal = { userId: "u-parent", schoolId: "s-1", role: "PARENT", status: "ACTIVE" };
const disabled: Principal = { ...teacher, status: "DISABLED" };

describe("announcement router — route protection", () => {
  it("rejects an unauthenticated caller (UNAUTHORIZED)", async () => {
    await expect(createCaller({ user: null }).announcement.list({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
  it("rejects a DISABLED account (FORBIDDEN)", async () => {
    await expect(createCaller({ user: disabled }).announcement.list({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("announcement router — permission gates (before any repo call)", () => {
  it("a PARENT cannot create (FORBIDDEN — not an author)", async () => {
    await expect(
      createCaller({ user: parent }).announcement.create({
        title: "t",
        body: "b",
        scope: "WHOLE_SCHOOL",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("a TEACHER cannot author a WHOLE_SCHOOL announcement (FORBIDDEN)", async () => {
    await expect(
      createCaller({ user: teacher }).announcement.create({
        title: "t",
        body: "b",
        scope: "WHOLE_SCHOOL",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("a TEACHER cannot publish (FORBIDDEN — admin-only)", async () => {
    await expect(
      createCaller({ user: teacher }).announcement.publish({ id: "a-1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("announcement router — Zod validation (BAD_REQUEST, before the resolver)", () => {
  const c = createCaller({ user: superAdmin });
  it("rejects an empty title", async () => {
    await expect(
      c.announcement.create({ title: "", body: "b", scope: "WHOLE_SCHOOL" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("rejects a SECTION scope with no targetId (refine)", async () => {
    await expect(
      c.announcement.create({ title: "t", body: "b", scope: "SECTION" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
