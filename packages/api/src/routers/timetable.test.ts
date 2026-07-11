import type { Principal } from "@repo/business";
import { describe, expect, it } from "vitest";

import { appRouter } from "../root";
import { createCallerFactory } from "../trpc";

const createCaller = createCallerFactory(appRouter);

/**
 * Transport-layer behaviour for the M9 timetable routers (ADR-017): route
 * protection (protectedProcedure), permission gates that fail in the service
 * BEFORE any repository call (assertCan → FORBIDDEN), and Zod input validation
 * (BAD_REQUEST, before the resolver). Conflict/ownership/scope/audit are
 * unit-tested in @repo/business (timetable.services).
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
const accountant: Principal = {
  userId: "u-acc",
  schoolId: "s-1",
  role: "ACCOUNTANT",
  status: "ACTIVE",
};
const disabled: Principal = { ...teacher, status: "DISABLED" };

const entryInput = {
  academicYearId: "y-1",
  sectionId: "sec-1",
  subjectId: "subj-1",
  teacherId: "u-t",
  periodId: "p-1",
  weekday: "MON" as const,
};
const periodInput = {
  bellScheduleId: "bs-1",
  name: "P1",
  order: 1,
  startTime: "09:00",
  endTime: "09:45",
  isBreak: false,
};

describe("timetable routers — route protection", () => {
  it("rejects an unauthenticated caller (UNAUTHORIZED)", async () => {
    await expect(
      createCaller({ user: null }).bellSchedule.getForYear({ academicYearId: "y-1" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("rejects a DISABLED account (FORBIDDEN)", async () => {
    await expect(createCaller({ user: disabled }).timetable.today({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("timetable routers — permission gates (fail before any repo call)", () => {
  it("a TEACHER cannot create an entry (FORBIDDEN — no timetable:manage)", async () => {
    await expect(
      createCaller({ user: teacher }).timetable.createEntry(entryInput),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("a PARENT cannot create an entry (FORBIDDEN)", async () => {
    await expect(
      createCaller({ user: parent }).timetable.createEntry(entryInput),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("a TEACHER cannot create a period (FORBIDDEN)", async () => {
    await expect(createCaller({ user: teacher }).period.create(periodInput)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
  it("a TEACHER cannot create a bell schedule (FORBIDDEN)", async () => {
    await expect(
      createCaller({ user: teacher }).bellSchedule.create({
        academicYearId: "y-1",
        name: "Regular",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("an ACCOUNTANT cannot read today's timetable (FORBIDDEN — no timetable:read)", async () => {
    await expect(createCaller({ user: accountant }).timetable.today({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("timetable routers — Zod input validation (BAD_REQUEST, before the resolver)", () => {
  const c = createCaller({ user: superAdmin });

  it("rejects an invalid weekday on createEntry", async () => {
    await expect(
      // @ts-expect-error — invalid enum value is the point of the test
      c.timetable.createEntry({ ...entryInput, weekday: "FUNDAY" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("rejects an empty sectionId on createEntry", async () => {
    await expect(c.timetable.createEntry({ ...entryInput, sectionId: "" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
  it("rejects a malformed clock time on period.create", async () => {
    await expect(c.period.create({ ...periodInput, startTime: "9am" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
  it("rejects a non-positive order on period.create", async () => {
    await expect(c.period.create({ ...periodInput, order: 0 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});
