import { PERMISSIONS, ROLES } from "@repo/constants";
import { describe, expect, it } from "vitest";

import { can, canAll, canAny, getPermissions } from "./authorization";

describe("authorization policy", () => {
  it("every role can read and update its own profile (baseline)", () => {
    for (const role of ROLES) {
      expect(can(role, PERMISSIONS.PROFILE_READ_SELF)).toBe(true);
      expect(can(role, PERMISSIONS.PROFILE_UPDATE_SELF)).toBe(true);
    }
  });

  it("only SUPER_ADMIN manages users, roles, and the audit log", () => {
    const adminOnly = [
      PERMISSIONS.USER_READ,
      PERMISSIONS.USER_INVITE,
      PERMISSIONS.USER_SET_ROLE,
      PERMISSIONS.USER_DISABLE,
      PERMISSIONS.AUDIT_READ,
    ] as const;

    for (const permission of adminOnly) {
      expect(can("SUPER_ADMIN", permission)).toBe(true);
      for (const role of ROLES.filter((r) => r !== "SUPER_ADMIN")) {
        expect(can(role, permission)).toBe(false);
      }
    }
  });

  it("getPermissions returns the role's full grant", () => {
    expect(getPermissions("PARENT")).toEqual([
      PERMISSIONS.PROFILE_READ_SELF,
      PERMISSIONS.PROFILE_UPDATE_SELF,
      // M3: parents read their own children + own parent record (row-scoped in service).
      PERMISSIONS.STUDENT_READ,
      PERMISSIONS.ENROLLMENT_READ,
      PERMISSIONS.STUDENT_DOCUMENT_READ,
      PERMISSIONS.PARENT_READ,
      // M4: read own child's attendance, apply for + read own leave, read the calendar.
      PERMISSIONS.ATTENDANCE_READ,
      PERMISSIONS.LEAVE_APPLY,
      PERMISSIONS.LEAVE_READ,
      PERMISSIONS.HOLIDAY_READ,
      // M5: read own child's PUBLISHED marks/grades only (row-scoped in service).
      PERMISSIONS.MARK_READ,
      // M6: read own child's published homework, submit/resubmit, read own submissions/feedback.
      PERMISSIONS.HOMEWORK_READ,
      PERMISSIONS.SUBMISSION_SUBMIT,
      PERMISSIONS.SUBMISSION_READ,
      // M7: read own child's PUBLISHED report cards only (row-scoped in service).
      PERMISSIONS.REPORT_CARD_READ,
      // M9: read own child's section timetable (row-scoped in service).
      PERMISSIONS.TIMETABLE_READ,
      // M10: own in-app notification inbox (self-scope in service).
      PERMISSIONS.NOTIFICATION_MANAGE_OWN,
    ]);
    expect(getPermissions("SUPER_ADMIN")).toContain(PERMISSIONS.USER_SET_ROLE);
    expect(getPermissions("SUPER_ADMIN")).toContain(PERMISSIONS.ANNOUNCEMENT_SEND);
    expect(getPermissions("SUPER_ADMIN")).toContain(PERMISSIONS.EXAM_MANAGE);
    expect(getPermissions("SUPER_ADMIN")).toContain(PERMISSIONS.HOMEWORK_MANAGE);
    expect(getPermissions("SUPER_ADMIN")).toContain(PERMISSIONS.REPORT_CARD_MANAGE);
    expect(getPermissions("SUPER_ADMIN")).toContain(PERMISSIONS.TIMETABLE_MANAGE);
    expect(getPermissions("TEACHER")).toContain(PERMISSIONS.REPORT_CARD_REMARK);
    expect(getPermissions("TEACHER")).toContain(PERMISSIONS.TIMETABLE_READ);
  });

  it("canAny / canAll combine permission checks", () => {
    expect(canAny("TEACHER", [PERMISSIONS.USER_DISABLE, PERMISSIONS.PROFILE_READ_SELF])).toBe(true);
    expect(canAll("TEACHER", [PERMISSIONS.USER_DISABLE, PERMISSIONS.PROFILE_READ_SELF])).toBe(
      false,
    );
    expect(canAll("SUPER_ADMIN", [PERMISSIONS.USER_DISABLE, PERMISSIONS.AUDIT_READ])).toBe(true);
  });
});
