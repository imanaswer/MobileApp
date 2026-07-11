import type { Principal } from "@repo/business";
import { describe, expect, it } from "vitest";

import { appRouter } from "../root";
import { createCallerFactory } from "../trpc";

const createCaller = createCallerFactory(appRouter);

/**
 * Transport-layer behaviour for the M10 notification router (ADR-018): route
 * protection (protectedProcedure), the announcement permission gate that fails in
 * the service BEFORE any repository call (assertCan → FORBIDDEN), and Zod input
 * validation (BAD_REQUEST, before the resolver). Recipient resolution, read/archive
 * state and audit are unit-tested in @repo/business (notification.services).
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

const announcement = { scope: "SCHOOL" as const, title: "Holiday", body: "Closed Friday" };

describe("notification router — route protection", () => {
  it("rejects an unauthenticated caller (UNAUTHORIZED)", async () => {
    await expect(createCaller({ user: null }).notification.unreadCount()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
  it("rejects a DISABLED account (FORBIDDEN)", async () => {
    await expect(createCaller({ user: disabled }).notification.unreadCount()).rejects.toMatchObject(
      { code: "FORBIDDEN" },
    );
  });
});

describe("notification router — announcement permission gate (before any repo call)", () => {
  it("a TEACHER cannot send an announcement (FORBIDDEN — no announcement:send)", async () => {
    await expect(
      createCaller({ user: teacher }).notification.createAnnouncement(announcement),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("a PARENT cannot send an announcement (FORBIDDEN)", async () => {
    await expect(
      createCaller({ user: parent }).notification.createAnnouncement(announcement),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("notification router — Zod input validation (BAD_REQUEST, before the resolver)", () => {
  const c = createCaller({ user: superAdmin });

  it("rejects a SECTION announcement with no sectionId (refine)", async () => {
    await expect(
      c.notification.createAnnouncement({ scope: "SECTION", title: "t", body: "b" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("rejects an empty title", async () => {
    await expect(
      c.notification.createAnnouncement({ ...announcement, title: "" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("rejects an out-of-range list limit", async () => {
    await expect(c.notification.list({ limit: 0 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(c.notification.list({ limit: 200 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
  it("rejects a non-ISO `before` cursor", async () => {
    await expect(c.notification.list({ before: "yesterday" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});
