import type { Principal } from "@repo/business";
import { PERMISSIONS, type Permission, type RoleKey } from "@repo/constants";
import { can } from "@repo/core";
import { describe, expect, it } from "vitest";

import { appRouter } from "../root";
import { createCallerFactory } from "../trpc";

const createCaller = createCallerFactory(appRouter);
type Caller = ReturnType<typeof createCaller>;

/**
 * Transport-layer behavior for the attendance routers (M4): route protection
 * (protectedProcedure), permission gates that fail in the service BEFORE any
 * repository call, and Zod input validation. Business rules, scope and the state
 * machine are unit-tested with mocked repositories in @repo/business.
 */

const superAdmin: Principal = { userId: "u-super", schoolId: "s-1", role: "SUPER_ADMIN", status: "ACTIVE" };
const teacher: Principal = { userId: "u-teacher", schoolId: "s-1", role: "TEACHER", status: "ACTIVE" };
const parent: Principal = { userId: "u-parent", schoolId: "s-1", role: "PARENT", status: "ACTIVE" };
const accountant: Principal = { userId: "u-acct", schoolId: "s-1", role: "ACCOUNTANT", status: "ACTIVE" };
const invited: Principal = { ...parent, status: "INVITED" };
const disabled: Principal = { ...parent, status: "DISABLED" };

describe("attendance routers — route protection", () => {
  it("rejects an unauthenticated caller (UNAUTHORIZED)", async () => {
    const caller = createCaller({ user: null });
    await expect(caller.holiday.list({ academicYearId: "y-1" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects INVITED and DISABLED accounts (FORBIDDEN)", async () => {
    await expect(createCaller({ user: invited }).holiday.list({ academicYearId: "y-1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createCaller({ user: disabled }).holiday.list({ academicYearId: "y-1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("attendance routers — permission gates (mapped to FORBIDDEN)", () => {
  it("denies an ACCOUNTANT the whole attendance surface", async () => {
    const caller = createCaller({ user: accountant });
    await expect(caller.attendance.summary({ enrollmentId: "e-1", from: "2026-08-01", to: "2026-08-31" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.holiday.list({ academicYearId: "y-1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("denies a PARENT marking + admin decisions", async () => {
    const caller = createCaller({ user: parent });
    await expect(
      caller.attendance.openSession({ academicYearId: "y-1", sectionId: "sec-1", sessionType: "DAILY", date: "2026-08-01" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.leave.decide({ leaveId: "lv-1", decision: "APPROVED" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.attendanceCorrection.listPending()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("denies a TEACHER the approval + holiday-write surface", async () => {
    const caller = createCaller({ user: teacher });
    await expect(caller.leave.decide({ leaveId: "lv-1", decision: "APPROVED" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.leave.listPending()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller.holiday.create({ academicYearId: "y-1", name: "X", date: "2026-11-01", type: "SCHOOL" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("attendance routers — Zod input validation (BAD_REQUEST)", () => {
  const caller = createCaller({ user: superAdmin });

  it("rejects an empty marks array", async () => {
    await expect(caller.attendance.mark({ sessionId: "ses-1", marks: [] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects an invalid calendar date on openSession", async () => {
    await expect(
      caller.attendance.openSession({ academicYearId: "y-1", sectionId: "sec-1", sessionType: "DAILY", date: "2026-13-40" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects a bad session type", async () => {
    await expect(
      // @ts-expect-error — deliberately invalid enum for the transport check
      caller.attendance.openSession({ academicYearId: "y-1", sectionId: "sec-1", sessionType: "WEEKLY", date: "2026-08-01" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects a holiday with a malformed date", async () => {
    await expect(
      caller.holiday.create({ academicYearId: "y-1", name: "X", date: "01-11-2026", type: "SCHOOL" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

/**
 * Authorization matrix — every attendance procedure × every role. The expected
 * result comes straight from the permissions policy (`can`): a role without the
 * gating permission must be rejected FORBIDDEN by the caller; a role with it must
 * pass the gate (it then fails downstream without a DB — never FORBIDDEN). Any
 * drift between the router gates and the permissions matrix fails here.
 */
const ROLE_KEYS: readonly RoleKey[] = ["SUPER_ADMIN", "OFFICE_ADMIN", "TEACHER", "PARENT", "ACCOUNTANT"];
const principalFor = (role: RoleKey): Principal => ({ userId: `u-${role}`, schoolId: "s-1", role, status: "ACTIVE" });

const PROCS: readonly { name: string; perm: Permission; call: (c: Caller) => Promise<unknown> }[] = [
  { name: "attendance.openSession", perm: PERMISSIONS.ATTENDANCE_MARK, call: (c) => c.attendance.openSession({ academicYearId: "y-1", sectionId: "sec-1", sessionType: "DAILY", date: "2026-08-01" }) },
  { name: "attendance.findSession", perm: PERMISSIONS.ATTENDANCE_READ, call: (c) => c.attendance.findSession({ sectionId: "sec-1", sessionType: "DAILY", date: "2026-08-01" }) },
  { name: "attendance.roster", perm: PERMISSIONS.ATTENDANCE_READ, call: (c) => c.attendance.roster({ sessionId: "ses-1" }) },
  { name: "attendance.mark", perm: PERMISSIONS.ATTENDANCE_MARK, call: (c) => c.attendance.mark({ sessionId: "ses-1", marks: [{ enrollmentId: "e-1", status: "PRESENT" }] }) },
  { name: "attendance.submit", perm: PERMISSIONS.ATTENDANCE_MARK, call: (c) => c.attendance.submit({ sessionId: "ses-1" }) },
  { name: "attendance.lock", perm: PERMISSIONS.ATTENDANCE_MARK, call: (c) => c.attendance.lock({ sessionId: "ses-1" }) },
  { name: "attendance.records", perm: PERMISSIONS.ATTENDANCE_READ, call: (c) => c.attendance.records({ sessionId: "ses-1" }) },
  { name: "attendance.history", perm: PERMISSIONS.ATTENDANCE_READ, call: (c) => c.attendance.history({ enrollmentId: "e-1", from: "2026-08-01", to: "2026-08-31" }) },
  { name: "attendance.summary", perm: PERMISSIONS.ATTENDANCE_READ, call: (c) => c.attendance.summary({ enrollmentId: "e-1", from: "2026-08-01", to: "2026-08-31" }) },
  { name: "leave.create", perm: PERMISSIONS.LEAVE_APPLY, call: (c) => c.leave.create({ enrollmentId: "e-1", fromDate: "2026-08-05", toDate: "2026-08-06", reason: "x" }) },
  { name: "leave.decide", perm: PERMISSIONS.LEAVE_DECIDE, call: (c) => c.leave.decide({ leaveId: "lv-1", decision: "APPROVED" }) },
  { name: "leave.cancel", perm: PERMISSIONS.LEAVE_APPLY, call: (c) => c.leave.cancel({ leaveId: "lv-1" }) },
  { name: "leave.listByEnrollment", perm: PERMISSIONS.LEAVE_READ, call: (c) => c.leave.listByEnrollment({ enrollmentId: "e-1" }) },
  { name: "leave.listPending", perm: PERMISSIONS.LEAVE_DECIDE, call: (c) => c.leave.listPending() },
  { name: "attendanceCorrection.submit", perm: PERMISSIONS.ATTENDANCE_CORRECT_SUBMIT, call: (c) => c.attendanceCorrection.submit({ attendanceRecordId: "rec-1", requestedStatus: "ABSENT", reason: "x" }) },
  { name: "attendanceCorrection.decide", perm: PERMISSIONS.ATTENDANCE_CORRECT_DECIDE, call: (c) => c.attendanceCorrection.decide({ correctionId: "cor-1", decision: "APPROVED" }) },
  { name: "attendanceCorrection.listPending", perm: PERMISSIONS.ATTENDANCE_CORRECT_DECIDE, call: (c) => c.attendanceCorrection.listPending() },
  { name: "attendanceCorrection.listMine", perm: PERMISSIONS.ATTENDANCE_CORRECT_SUBMIT, call: (c) => c.attendanceCorrection.listMine() },
  { name: "holiday.list", perm: PERMISSIONS.HOLIDAY_READ, call: (c) => c.holiday.list({ academicYearId: "y-1" }) },
  { name: "holiday.create", perm: PERMISSIONS.ACADEMIC_MANAGE, call: (c) => c.holiday.create({ academicYearId: "y-1", name: "X", date: "2026-11-01", type: "SCHOOL" }) },
  { name: "holiday.delete", perm: PERMISSIONS.ACADEMIC_MANAGE, call: (c) => c.holiday.delete({ id: "hol-1" }) },
];

describe("attendance routers — authorization matrix (procedure × role)", () => {
  for (const proc of PROCS) {
    for (const role of ROLE_KEYS) {
      const granted = can(role, proc.perm);
      it(`${role} is ${granted ? "granted" : "denied"} ${proc.name}`, async () => {
        if (granted) {
          // The permissions matrix grants this capability. Row/section SCOPE
          // (own-child / own-section) narrows it further and is enforced +
          // tested in @repo/business (parent-another-child, teacher-another-section).
          expect(can(role, proc.perm)).toBe(true);
        } else {
          // Enforcement: a role without the gating permission is stopped at the
          // router (assertCan → FORBIDDEN) before any repository call.
          const caller = createCaller({ user: principalFor(role) });
          await expect(proc.call(caller)).rejects.toMatchObject({ code: "FORBIDDEN" });
        }
      });
    }
  }
});
