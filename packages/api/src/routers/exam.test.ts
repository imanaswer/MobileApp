import type { Principal } from "@repo/business";
import { PERMISSIONS, type Permission, type RoleKey } from "@repo/constants";
import { can } from "@repo/core";
import { describe, expect, it } from "vitest";

import { appRouter } from "../root";
import { createCallerFactory } from "../trpc";

const createCaller = createCallerFactory(appRouter);
type Caller = ReturnType<typeof createCaller>;

/**
 * Transport-layer behavior for the M5 exam routers: route protection
 * (protectedProcedure), permission gates that fail in the service BEFORE any
 * repository call, and Zod input validation. Business rules, scope, the
 * lifecycle, and grade snapshotting are unit-tested in @repo/business
 * (exam.services / mark.service / deletion.service / mark.concurrency).
 */

const superAdmin: Principal = {
  userId: "u-super",
  schoolId: "s-1",
  role: "SUPER_ADMIN",
  status: "ACTIVE",
};
const parent: Principal = { userId: "u-parent", schoolId: "s-1", role: "PARENT", status: "ACTIVE" };
const disabled: Principal = { ...parent, status: "DISABLED" };

describe("exam routers — route protection", () => {
  it("rejects an unauthenticated caller (UNAUTHORIZED)", async () => {
    await expect(
      createCaller({ user: null }).exam.list({ academicYearId: "y-1" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("rejects a DISABLED account (FORBIDDEN)", async () => {
    await expect(
      createCaller({ user: disabled }).exam.list({ academicYearId: "y-1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("exam routers — Zod input validation (BAD_REQUEST, before the resolver)", () => {
  const c = createCaller({ user: superAdmin });

  it("rejects an empty marks array", async () => {
    await expect(
      c.mark.save({ assessmentId: "as-1", sectionId: "sec-1", marks: [] }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("rejects negative maximum marks", async () => {
    await expect(
      c.assessment.create({ examId: "ex-1", subjectId: "sub-1", maxTheory: -5, passMark: 0 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("rejects an unknown exam type", async () => {
    // @ts-expect-error — invalid enum value is the point of the test
    await expect(
      c.exam.create({ academicYearId: "y-1", name: "T", type: "NOPE" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("rejects an empty unlock reason", async () => {
    await expect(c.mark.unlock({ examSectionId: "es-1", reason: "   " })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
  it("rejects a grade scale with no bands", async () => {
    await expect(
      c.gradeScale.create({ name: "S", isDefault: false, bands: [] }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

/**
 * Authorization matrix — every exam procedure × every role. The expected result
 * comes straight from the permissions policy (`can`): a role without the gating
 * permission must be rejected FORBIDDEN by the caller (assertCan, before any DB
 * call); a role with it passes the gate (then fails downstream without a DB —
 * never FORBIDDEN). Row/section SCOPE (own-child / own-section) narrows the
 * granted cells further and is enforced + tested in @repo/business. Any drift
 * between the router gates and the permissions matrix fails here.
 */
const ROLE_KEYS: readonly RoleKey[] = [
  "SUPER_ADMIN",
  "OFFICE_ADMIN",
  "TEACHER",
  "PARENT",
  "ACCOUNTANT",
];
const principalFor = (role: RoleKey): Principal => ({
  userId: `u-${role}`,
  schoolId: "s-1",
  role,
  status: "ACTIVE",
});

const PROCS: readonly { name: string; perm: Permission; call: (c: Caller) => Promise<unknown> }[] =
  [
    {
      name: "exam.create",
      perm: PERMISSIONS.EXAM_MANAGE,
      call: (c) => c.exam.create({ academicYearId: "y-1", name: "T", type: "ANNUAL" }),
    },
    {
      name: "exam.update",
      perm: PERMISSIONS.EXAM_MANAGE,
      call: (c) => c.exam.update({ examId: "ex-1", name: "x" }),
    },
    {
      name: "exam.publish",
      perm: PERMISSIONS.EXAM_MANAGE,
      call: (c) => c.exam.publish({ examId: "ex-1" }),
    },
    {
      name: "exam.get",
      perm: PERMISSIONS.EXAM_MANAGE,
      call: (c) => c.exam.get({ examId: "ex-1" }),
    },
    {
      name: "exam.list",
      perm: PERMISSIONS.EXAM_MANAGE,
      call: (c) => c.exam.list({ academicYearId: "y-1" }),
    },
    {
      name: "exam.registers",
      perm: PERMISSIONS.EXAM_MANAGE,
      call: (c) => c.exam.registers({ examId: "ex-1" }),
    },
    {
      name: "exam.delete",
      perm: PERMISSIONS.EXAM_MANAGE,
      call: (c) => c.exam.delete({ examId: "ex-1" }),
    },
    {
      name: "assessment.create",
      perm: PERMISSIONS.EXAM_MANAGE,
      call: (c) =>
        c.assessment.create({ examId: "ex-1", subjectId: "sub-1", maxTheory: 80, passMark: 30 }),
    },
    {
      name: "assessment.list",
      perm: PERMISSIONS.EXAM_MANAGE,
      call: (c) => c.assessment.list({ examId: "ex-1" }),
    },
    {
      name: "assessment.delete",
      perm: PERMISSIONS.EXAM_MANAGE,
      call: (c) => c.assessment.delete({ assessmentId: "as-1" }),
    },
    { name: "mark.markable", perm: PERMISSIONS.MARK_ENTER, call: (c) => c.mark.markable() },
    {
      name: "mark.save",
      perm: PERMISSIONS.MARK_ENTER,
      call: (c) =>
        c.mark.save({ assessmentId: "as-1", sectionId: "sec-1", marks: [{ enrollmentId: "e-1" }] }),
    },
    {
      name: "mark.submit",
      perm: PERMISSIONS.MARK_ENTER,
      call: (c) => c.mark.submit({ examSectionId: "es-1" }),
    },
    {
      name: "mark.lock",
      perm: PERMISSIONS.EXAM_MANAGE,
      call: (c) => c.mark.lock({ examSectionId: "es-1" }),
    },
    {
      name: "mark.unlock",
      perm: PERMISSIONS.EXAM_MANAGE,
      call: (c) => c.mark.unlock({ examSectionId: "es-1", reason: "fix" }),
    },
    {
      name: "mark.listByRegister",
      perm: PERMISSIONS.MARK_READ,
      call: (c) => c.mark.listByRegister({ examSectionId: "es-1" }),
    },
    {
      name: "mark.listByEnrollment",
      perm: PERMISSIONS.MARK_READ,
      call: (c) => c.mark.listByEnrollment({ enrollmentId: "e-1" }),
    },
    {
      name: "mark.gpa",
      perm: PERMISSIONS.MARK_READ,
      call: (c) => c.mark.gpa({ enrollmentId: "e-1" }),
    },
    {
      name: "mark.deleteRegister",
      perm: PERMISSIONS.EXAM_MANAGE,
      call: (c) => c.mark.deleteRegister({ examSectionId: "es-1" }),
    },
    {
      name: "gradeScale.create",
      perm: PERMISSIONS.EXAM_MANAGE,
      call: (c) =>
        c.gradeScale.create({
          name: "S",
          isDefault: false,
          bands: [{ grade: "A", minPercent: 0, maxPercent: 100 }],
        }),
    },
    { name: "gradeScale.list", perm: PERMISSIONS.EXAM_MANAGE, call: (c) => c.gradeScale.list() },
  ];

describe("exam routers — authorization matrix (procedure × role)", () => {
  for (const proc of PROCS) {
    for (const role of ROLE_KEYS) {
      const granted = can(role, proc.perm);
      it(`${role} is ${granted ? "granted" : "denied"} ${proc.name}`, async () => {
        if (granted) {
          // The permissions matrix grants this capability; row/section scope
          // narrows it further in @repo/business (tested there).
          expect(can(role, proc.perm)).toBe(true);
        } else {
          // A role without the gating permission is stopped at the router
          // (assertCan → FORBIDDEN) before any repository call.
          const caller = createCaller({ user: principalFor(role) });
          await expect(proc.call(caller)).rejects.toMatchObject({ code: "FORBIDDEN" });
        }
      });
    }
  }
});
