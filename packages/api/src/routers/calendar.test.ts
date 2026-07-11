import type { Principal } from "@repo/business";
import { describe, expect, it } from "vitest";

import { appRouter } from "../root";
import { createCallerFactory } from "../trpc";

const createCaller = createCallerFactory(appRouter);

/**
 * Transport-layer behaviour for the M11 calendar router (ADR-019): route protection,
 * the academic:manage write gate that fails BEFORE any repo call (assertCan →
 * FORBIDDEN), and Zod input validation (BAD_REQUEST). CRUD + range logic is unit-
 * tested in @repo/business (calendar.services).
 */
const teacher: Principal = {
  userId: "u-teacher",
  schoolId: "s-1",
  role: "TEACHER",
  status: "ACTIVE",
};
const parent: Principal = { userId: "u-parent", schoolId: "s-1", role: "PARENT", status: "ACTIVE" };
const admin: Principal = {
  userId: "u-admin",
  schoolId: "s-1",
  role: "OFFICE_ADMIN",
  status: "ACTIVE",
};
const validEvent = {
  title: "Diwali",
  eventType: "HOLIDAY" as const,
  startDate: "2026-11-08",
  endDate: "2026-11-10",
};

describe("calendar router — route protection", () => {
  it("rejects an unauthenticated caller (UNAUTHORIZED)", async () => {
    await expect(createCaller({ user: null }).calendar.upcoming({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

describe("calendar router — write gate (before any repo call)", () => {
  it("a TEACHER cannot create an event (FORBIDDEN — academic:manage)", async () => {
    await expect(createCaller({ user: teacher }).calendar.create(validEvent)).rejects.toMatchObject(
      { code: "FORBIDDEN" },
    );
  });
  it("a PARENT cannot create an event (FORBIDDEN)", async () => {
    await expect(createCaller({ user: parent }).calendar.create(validEvent)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("calendar router — Zod validation (BAD_REQUEST, before the resolver)", () => {
  const c = createCaller({ user: admin });
  it("rejects endDate before startDate (refine)", async () => {
    await expect(
      c.calendar.create({ ...validEvent, startDate: "2026-11-10", endDate: "2026-11-08" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("rejects a malformed date", async () => {
    await expect(
      c.calendar.create({ ...validEvent, startDate: "2026-13-40" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("rejects month out of range on the month view", async () => {
    await expect(c.calendar.month({ year: 2026, month: 13 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});
