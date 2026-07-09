import { ConflictError, ForbiddenError, ValidationError } from "@repo/core";
import type {
  AttendanceCorrection,
  AttendanceRecordWithDate,
  AttendanceSession,
  Enrollment,
  Holiday,
  LeaveRequest,
  Repositories,
  Staff,
  Student,
  TeacherAssignment,
} from "@repo/db";
import { createNotificationService } from "@repo/notifications";
import { describe, expect, it, vi } from "vitest";

import type { Principal } from "../../authorization";
import type { ServiceContext } from "../../context";

import {
  attendanceSummary,
  findSession,
  lockSession,
  markAttendance,
  openSession,
  sessionRoster,
  studentAttendanceHistory,
  submitSession,
} from "./attendance.service";
import {
  decideCorrection,
  listPendingCorrections,
  submitCorrection,
} from "./correction.service";
import { createHoliday, deleteHoliday, listHolidays } from "./holiday.service";
import { applyLeave, cancelLeave, decideLeave, listPendingLeaves } from "./leave.service";

/* ---- principals ---- */
const officeAdmin: Principal = { userId: "u-office", schoolId: "s-1", role: "OFFICE_ADMIN", status: "ACTIVE" };
const teacher: Principal = { userId: "u-teacher", schoolId: "s-1", role: "TEACHER", status: "ACTIVE" };
const parent: Principal = { userId: "u-parent", schoolId: "s-1", role: "PARENT", status: "ACTIVE" };

/* ---- fixtures ---- */
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const stamps = { createdAt: d("2026-01-01"), updatedAt: d("2026-01-01") };
const DATE = d("2026-08-01");

const staffRow: Staff = {
  id: "sf-1", schoolId: "s-1", userId: "u-teacher", employeeId: "EMP-01",
  department: null, qualification: null, experienceYears: null, joiningDate: null,
  bio: null, photoPath: null, ...stamps,
};
const studentRow: Student = {
  id: "st-1", schoolId: "s-1", admissionNo: "ADM-1", firstName: "Asha", lastName: "Nair",
  dob: null, gender: null, bloodGroup: null, nationality: null, aadhaar: null, passport: null,
  address: null, photoPath: null, status: "ACTIVE", ...stamps,
};
const enrollmentRow: Enrollment = {
  id: "e-1", schoolId: "s-1", studentId: "st-1", academicYearId: "y-1", classId: "c-1",
  sectionId: "sec-1", rollNo: 7, status: "ACTIVE", ...stamps,
};
const assignmentRow: TeacherAssignment = {
  id: "a-1", schoolId: "s-1", teacherId: "u-teacher", subjectId: "sub-1", sectionId: "sec-1",
  ...stamps,
};
const sessionRow: AttendanceSession = {
  id: "ses-1", schoolId: "s-1", academicYearId: "y-1", sectionId: "sec-1", subjectId: null,
  sessionType: "DAILY", date: DATE, status: "DRAFT", createdByStaffId: "sf-1",
  submittedByStaffId: null, lockedByStaffId: null, submittedAt: null, lockedAt: null, ...stamps,
};
const rec = (status: AttendanceRecordWithDate["status"]): AttendanceRecordWithDate => ({
  id: `rec-${status}`, schoolId: "s-1", sessionId: "ses-1", enrollmentId: "e-1", status,
  remarks: null, ...stamps, session: { date: DATE },
});
const leaveRow: LeaveRequest = {
  id: "lv-1", schoolId: "s-1", enrollmentId: "e-1", parentId: "p-1", fromDate: d("2026-08-05"),
  toDate: d("2026-08-06"), reason: "fever", status: "PENDING", decidedByStaffId: null,
  decidedAt: null, ...stamps,
};
const correctionRow: AttendanceCorrection = {
  id: "cor-1", schoolId: "s-1", attendanceRecordId: "rec-PRESENT", requestedByStaffId: "sf-1",
  previousStatus: "PRESENT", requestedStatus: "ABSENT", reason: "was here", status: "PENDING",
  decidedByStaffId: null, decidedAt: null, ...stamps,
};
const holidayRow: Holiday = {
  id: "hol-1", schoolId: "s-1", academicYearId: "y-1", name: "Diwali", date: d("2026-11-01"),
  type: "FESTIVAL", ...stamps,
};

/** Full happy-path repository aggregate; tests override per case. */
function makeRepos() {
  return {
    audit: { record: vi.fn(async (): Promise<void> => undefined) },
    academicYears: { findById: vi.fn(async () => ({ schoolId: "s-1" })), findActive: vi.fn(async () => ({ id: "y-1" })) },
    sections: { findById: vi.fn(async () => ({ id: "sec-1", classId: "c-1" })) },
    subjects: { findById: vi.fn(async () => ({ id: "sub-1", schoolId: "s-1" })) },
    teacherAssignments: { list: vi.fn(async (): Promise<TeacherAssignment[]> => [assignmentRow]) },
    students: { findById: vi.fn(async (): Promise<Student | null> => studentRow) },
    enrollments: {
      findById: vi.fn(async (): Promise<Enrollment | null> => enrollmentRow),
      listBySection: vi.fn(async (): Promise<Enrollment[]> => [enrollmentRow]),
    },
    staff: { findByUserId: vi.fn(async (): Promise<Staff | null> => staffRow) },
    parents: { findByUserId: vi.fn(async () => ({ id: "p-1", schoolId: "s-1" })) },
    studentParents: { studentIdsForParent: vi.fn(async (): Promise<string[]> => ["st-1"]) },
    attendanceSessions: {
      findById: vi.fn(async (): Promise<AttendanceSession | null> => sessionRow),
      findExisting: vi.fn(async (): Promise<AttendanceSession | null> => null),
      create: vi.fn(async (): Promise<AttendanceSession> => sessionRow),
      transition: vi.fn(async (_id: string, _from: string, data: Partial<AttendanceSession>): Promise<AttendanceSession> => ({ ...sessionRow, ...data })),
    },
    attendanceRecords: {
      findById: vi.fn(async (): Promise<AttendanceRecordWithDate | null> => rec("PRESENT")),
      listBySession: vi.fn(async (): Promise<AttendanceRecordWithDate[]> => []),
      listByEnrollmentInRange: vi.fn(async (): Promise<AttendanceRecordWithDate[]> => []),
      upsert: vi.fn(async (input: { status: AttendanceRecordWithDate["status"] }): Promise<AttendanceRecordWithDate> => rec(input.status)),
      updateStatus: vi.fn(async (): Promise<AttendanceRecordWithDate> => rec("ABSENT")),
    },
    leaveRequests: {
      findById: vi.fn(async (): Promise<LeaveRequest | null> => leaveRow),
      listByEnrollment: vi.fn(async (): Promise<LeaveRequest[]> => [leaveRow]),
      listPending: vi.fn(async (): Promise<LeaveRequest[]> => [leaveRow]),
      approvedEnrollmentIdsOnDate: vi.fn(async (): Promise<string[]> => []),
      create: vi.fn(async (): Promise<LeaveRequest> => leaveRow),
      update: vi.fn(async (_id: string, data: Partial<LeaveRequest>): Promise<LeaveRequest> => ({ ...leaveRow, ...data })),
    },
    attendanceCorrections: {
      findById: vi.fn(async (): Promise<AttendanceCorrection | null> => correctionRow),
      listPending: vi.fn(async (): Promise<AttendanceCorrection[]> => [correctionRow]),
      create: vi.fn(async (): Promise<AttendanceCorrection> => correctionRow),
      decide: vi.fn(async (_id: string, data: Partial<AttendanceCorrection>): Promise<AttendanceCorrection> => ({ ...correctionRow, ...data })),
    },
    holidays: {
      findById: vi.fn(async (): Promise<Holiday | null> => holidayRow),
      listByYear: vi.fn(async (): Promise<Holiday[]> => [holidayRow]),
      findByYearDate: vi.fn(async (): Promise<Holiday | null> => null),
      create: vi.fn(async (): Promise<Holiday> => holidayRow),
      delete: vi.fn(async (): Promise<void> => undefined),
    },
  };
}

function makeCtx(user: Principal, repos = makeRepos()) {
  const repositories = repos as unknown as Repositories;
  const ctx: ServiceContext = {
    user,
    repositories,
    notifications: createNotificationService([]),
    withTransaction: <T>(fn: (r: Repositories) => Promise<T>) => fn(repositories),
  };
  return { ctx, repos };
}

const openInput = {
  academicYearId: "y-1", sectionId: "sec-1", sessionType: "DAILY" as const, date: DATE,
};

/* ============================ session workflow ============================ */
describe("attendance — session workflow & state machine", () => {
  it("opens a DRAFT register (admin) and audits in-tx", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    const dto = await openSession(ctx, openInput);
    expect(dto).toMatchObject({ status: "DRAFT", sectionId: "sec-1" });
    expect(repos.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ATTENDANCE_SESSION_OPEN" }),
    );
  });

  it("rejects a DUPLICATE session (ConflictError)", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    repos.attendanceSessions.findExisting.mockResolvedValueOnce(sessionRow);
    await expect(openSession(ctx, openInput)).rejects.toThrow(ConflictError);
    expect(repos.attendanceSessions.create).not.toHaveBeenCalled();
  });

  it("rejects opening a register on a HOLIDAY (ValidationError)", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    repos.holidays.findByYearDate.mockResolvedValueOnce(holidayRow);
    await expect(openSession(ctx, openInput)).rejects.toThrow(ValidationError);
    expect(repos.attendanceSessions.create).not.toHaveBeenCalled();
  });

  it("blocks a TEACHER opening a section they don't teach (ForbiddenError)", async () => {
    const { ctx, repos } = makeCtx(teacher);
    repos.teacherAssignments.list.mockResolvedValueOnce([]); // teaches nothing
    await expect(openSession(ctx, openInput)).rejects.toThrow(ForbiddenError);
  });

  it("requires the actor to have a Staff row — B3 (ValidationError)", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    repos.staff.findByUserId.mockResolvedValueOnce(null);
    await expect(openSession(ctx, openInput)).rejects.toThrow(ValidationError);
  });

  it("walks DRAFT → SUBMITTED → LOCKED, stamping actors", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    const submitted = await submitSession(ctx, "ses-1");
    expect(submitted.status).toBe("SUBMITTED");
    expect(repos.attendanceSessions.transition).toHaveBeenCalledWith(
      "ses-1", "DRAFT", expect.objectContaining({ status: "SUBMITTED", submittedByStaffId: "sf-1" }),
    );
    repos.attendanceSessions.findById.mockResolvedValueOnce({ ...sessionRow, status: "SUBMITTED" });
    const locked = await lockSession(ctx, "ses-1");
    expect(locked.status).toBe("LOCKED");
  });

  it("refuses to submit a non-DRAFT register (ValidationError)", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    repos.attendanceSessions.findById.mockResolvedValueOnce({ ...sessionRow, status: "LOCKED" });
    await expect(submitSession(ctx, "ses-1")).rejects.toThrow(ValidationError);
  });

  it("findSession returns the existing register or null", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    expect(await findSession(ctx, { sectionId: "sec-1", sessionType: "DAILY", date: DATE })).toBeNull();
    repos.attendanceSessions.findExisting.mockResolvedValueOnce(sessionRow);
    expect(await findSession(ctx, { sectionId: "sec-1", sessionType: "DAILY", date: DATE })).toMatchObject({ id: "ses-1" });
  });
});

/* ============================ marking & edges ============================ */
describe("attendance — marking rules & edge cases", () => {
  const marks = [{ enrollmentId: "e-1", status: "PRESENT" as const }];

  it("marks a DRAFT register (idempotent upsert) and audits once", async () => {
    const { ctx, repos } = makeCtx(teacher);
    const out = await markAttendance(ctx, { sessionId: "ses-1", marks });
    expect(out).toHaveLength(1);
    expect(repos.attendanceRecords.upsert).toHaveBeenCalledTimes(1);
    expect(repos.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ATTENDANCE_MARK" }),
    );
  });

  it("blocks a TEACHER marking a section they don't teach (ForbiddenError)", async () => {
    const { ctx, repos } = makeCtx(teacher);
    repos.attendanceSessions.findById.mockResolvedValueOnce({ ...sessionRow, sectionId: "sec-2" });
    await expect(markAttendance(ctx, { sessionId: "ses-1", marks })).rejects.toThrow(ForbiddenError);
    expect(repos.attendanceRecords.upsert).not.toHaveBeenCalled();
  });

  it("rejects an enrollment from ANOTHER section (ForbiddenError)", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    repos.enrollments.findById.mockResolvedValueOnce({ ...enrollmentRow, sectionId: "sec-9" });
    await expect(markAttendance(ctx, { sessionId: "ses-1", marks })).rejects.toThrow(ForbiddenError);
    expect(repos.attendanceRecords.upsert).not.toHaveBeenCalled();
  });

  it("refuses attendance AFTER WITHDRAWAL / after promotion — non-ACTIVE enrollment", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    repos.enrollments.findById.mockResolvedValueOnce({ ...enrollmentRow, status: "DROPPED" });
    await expect(markAttendance(ctx, { sessionId: "ses-1", marks })).rejects.toThrow(ValidationError);
    repos.enrollments.findById.mockResolvedValueOnce({ ...enrollmentRow, status: "PROMOTED" });
    await expect(markAttendance(ctx, { sessionId: "ses-1", marks })).rejects.toThrow(ValidationError);
  });

  it("BULK ROLLBACK: a bad row aborts the whole batch before any write", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    // first enrollment ok, second is out-of-section → nothing is written
    repos.enrollments.findById
      .mockResolvedValueOnce(enrollmentRow)
      .mockResolvedValueOnce({ ...enrollmentRow, id: "e-2", sectionId: "sec-9" });
    await expect(
      markAttendance(ctx, {
        sessionId: "ses-1",
        marks: [
          { enrollmentId: "e-1", status: "PRESENT" },
          { enrollmentId: "e-2", status: "ABSENT" },
        ],
      }),
    ).rejects.toThrow(ForbiddenError);
    expect(repos.attendanceRecords.upsert).not.toHaveBeenCalled();
  });

  it("marks LATE and HALF_DAY as first-class statuses", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    await markAttendance(ctx, { sessionId: "ses-1", marks: [{ enrollmentId: "e-1", status: "LATE" }] });
    await markAttendance(ctx, { sessionId: "ses-1", marks: [{ enrollmentId: "e-1", status: "HALF_DAY" }] });
    expect(repos.attendanceRecords.upsert).toHaveBeenNthCalledWith(1, expect.objectContaining({ status: "LATE" }));
    expect(repos.attendanceRecords.upsert).toHaveBeenNthCalledWith(2, expect.objectContaining({ status: "HALF_DAY" }));
  });

  it("refuses to mark a SUBMITTED/LOCKED register — DRAFT only (ValidationError)", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    repos.attendanceSessions.findById.mockResolvedValueOnce({ ...sessionRow, status: "SUBMITTED" });
    await expect(markAttendance(ctx, { sessionId: "ses-1", marks })).rejects.toThrow(ValidationError);
  });
});

/* ============================ roster & leave-default ============================ */
describe("attendance — roster & leave-derived default", () => {
  it("suggests LEAVE for an enrollment with approved leave on the date (no eager write)", async () => {
    const { ctx, repos } = makeCtx(teacher);
    repos.leaveRequests.approvedEnrollmentIdsOnDate.mockResolvedValueOnce(["e-1"]);
    const rows = await sessionRoster(ctx, "ses-1");
    expect(rows[0]).toMatchObject({ enrollmentId: "e-1", suggestedStatus: "LEAVE" });
    expect(repos.attendanceRecords.upsert).not.toHaveBeenCalled();
  });

  it("defaults to PRESENT with no leave and no existing mark", async () => {
    const { ctx } = makeCtx(teacher);
    const rows = await sessionRoster(ctx, "ses-1");
    expect(rows[0]?.suggestedStatus).toBe("PRESENT");
  });
});

/* ============================ summary weighting ============================ */
describe("attendance — summary (compute-on-read weighting)", () => {
  it("weights PRESENT/LATE=1, HALF_DAY=0.5, ABSENT=0, excludes LEAVE", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    repos.attendanceRecords.listByEnrollmentInRange.mockResolvedValueOnce([
      rec("PRESENT"), rec("LATE"), rec("HALF_DAY"), rec("ABSENT"), rec("LEAVE"),
    ]);
    const s = await attendanceSummary(ctx, { enrollmentId: "e-1", from: DATE, to: d("2026-08-31") });
    // attended 2.5 over 4 countable (LEAVE excluded) → 62.5%
    expect(s).toMatchObject({ countableDays: 4, leave: 1, percentage: 62.5 });
  });

  it("returns null percentage when there are no countable days", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    repos.attendanceRecords.listByEnrollmentInRange.mockResolvedValueOnce([rec("LEAVE")]);
    const s = await attendanceSummary(ctx, { enrollmentId: "e-1", from: DATE, to: DATE });
    expect(s.percentage).toBeNull();
  });

  it("blocks a PARENT viewing ANOTHER child (ForbiddenError)", async () => {
    const { ctx, repos } = makeCtx(parent);
    repos.studentParents.studentIdsForParent.mockResolvedValueOnce(["st-OTHER"]);
    await expect(
      studentAttendanceHistory(ctx, { enrollmentId: "e-1", from: DATE, to: DATE }),
    ).rejects.toThrow(ForbiddenError);
  });
});

/* ============================ leave workflow ============================ */
describe("attendance — leave workflow", () => {
  it("a PARENT applies for their own child (PENDING) and audits", async () => {
    const { ctx, repos } = makeCtx(parent);
    const dto = await applyLeave(ctx, { enrollmentId: "e-1", fromDate: d("2026-08-05"), toDate: d("2026-08-06"), reason: "fever" });
    expect(dto.status).toBe("PENDING");
    expect(repos.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "LEAVE_APPLY" }));
  });

  it("blocks a PARENT applying for ANOTHER child (ForbiddenError)", async () => {
    const { ctx, repos } = makeCtx(parent);
    repos.studentParents.studentIdsForParent.mockResolvedValueOnce(["st-OTHER"]);
    await expect(
      applyLeave(ctx, { enrollmentId: "e-1", fromDate: DATE, toDate: DATE, reason: "x" }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("rejects fromDate after toDate (ValidationError)", async () => {
    const { ctx } = makeCtx(parent);
    await expect(
      applyLeave(ctx, { enrollmentId: "e-1", fromDate: d("2026-08-10"), toDate: d("2026-08-05"), reason: "x" }),
    ).rejects.toThrow(ValidationError);
  });

  it("APPROVING leave writes NO attendance records (ADR-011 §7)", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    const dto = await decideLeave(ctx, { leaveId: "lv-1", decision: "APPROVED" });
    expect(dto.status).toBe("APPROVED");
    expect(repos.attendanceRecords.upsert).not.toHaveBeenCalled();
    expect(repos.attendanceRecords.updateStatus).not.toHaveBeenCalled();
  });

  it("rejects deciding a non-PENDING leave (ConflictError)", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    repos.leaveRequests.findById.mockResolvedValueOnce({ ...leaveRow, status: "APPROVED" });
    await expect(decideLeave(ctx, { leaveId: "lv-1", decision: "REJECTED" })).rejects.toThrow(ConflictError);
  });

  it("a PARENT cancels their own PENDING request", async () => {
    const { ctx } = makeCtx(parent);
    const dto = await cancelLeave(ctx, "lv-1");
    expect(dto.status).toBe("CANCELLED");
  });

  it("the pending queue is enriched with the child's name", async () => {
    const { ctx } = makeCtx(officeAdmin);
    const rows = await listPendingLeaves(ctx);
    expect(rows[0]).toMatchObject({ studentName: "Asha Nair" });
  });
});

/* ============================ correction workflow ============================ */
describe("attendance — correction workflow", () => {
  it("submits an immutable request snapshotting previousStatus", async () => {
    const { ctx, repos } = makeCtx(teacher);
    const dto = await submitCorrection(ctx, { attendanceRecordId: "rec-PRESENT", requestedStatus: "ABSENT", reason: "was here" });
    expect(dto).toMatchObject({ previousStatus: "PRESENT", requestedStatus: "ABSENT", status: "PENDING" });
    expect(repos.attendanceCorrections.create).toHaveBeenCalledWith(
      expect.objectContaining({ previousStatus: "PRESENT", requestedStatus: "ABSENT" }),
    );
  });

  it("rejects a no-op correction (requested == current)", async () => {
    const { ctx } = makeCtx(teacher);
    await expect(
      submitCorrection(ctx, { attendanceRecordId: "rec-PRESENT", requestedStatus: "PRESENT", reason: "x" }),
    ).rejects.toThrow(ValidationError);
  });

  it("APPROVING updates the record + audits old→new (optimistic guard holds)", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    const dto = await decideCorrection(ctx, { correctionId: "cor-1", decision: "APPROVED" });
    expect(dto.status).toBe("APPROVED");
    expect(repos.attendanceRecords.updateStatus).toHaveBeenCalledWith("rec-PRESENT", "ABSENT");
    expect(repos.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ATTENDANCE_CORRECTION_APPROVE", before: { status: "PRESENT" } }),
    );
  });

  it("blocks approval when the record DRIFTED since the request (ConflictError)", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    repos.attendanceRecords.findById.mockResolvedValueOnce(rec("LATE")); // no longer PRESENT
    await expect(decideCorrection(ctx, { correctionId: "cor-1", decision: "APPROVED" })).rejects.toThrow(ConflictError);
    expect(repos.attendanceRecords.updateStatus).not.toHaveBeenCalled();
  });

  it("REJECTING leaves the record untouched", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    const dto = await decideCorrection(ctx, { correctionId: "cor-1", decision: "REJECTED" });
    expect(dto.status).toBe("REJECTED");
    expect(repos.attendanceRecords.updateStatus).not.toHaveBeenCalled();
  });

  it("the pending queue is enriched with student name + date", async () => {
    const { ctx } = makeCtx(officeAdmin);
    const rows = await listPendingCorrections(ctx);
    expect(rows[0]).toMatchObject({ studentName: "Asha Nair", date: "2026-08-01" });
  });
});

/* ============================ holiday + authorization ============================ */
describe("attendance — holidays & authorization gates", () => {
  it("creates a holiday (ACADEMIC_MANAGE) and audits", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    const dto = await createHoliday(ctx, { academicYearId: "y-1", name: "Diwali", date: d("2026-11-01"), type: "FESTIVAL" });
    expect(dto).toMatchObject({ name: "Diwali", type: "FESTIVAL" });
    expect(repos.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "HOLIDAY_CREATE" }));
  });

  it("rejects a duplicate holiday on the same date (ConflictError)", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    repos.holidays.findByYearDate.mockResolvedValueOnce(holidayRow);
    await expect(
      createHoliday(ctx, { academicYearId: "y-1", name: "X", date: d("2026-11-01"), type: "SCHOOL" }),
    ).rejects.toThrow(ConflictError);
  });

  it("deletes a holiday and audits", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    await deleteHoliday(ctx, "hol-1");
    expect(repos.holidays.delete).toHaveBeenCalledWith("hol-1");
    expect(repos.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "HOLIDAY_DELETE" }));
  });

  it("lists the calendar for a role holding HOLIDAY_READ (parent)", async () => {
    const { ctx } = makeCtx(parent);
    expect(await listHolidays(ctx, "y-1")).toHaveLength(1);
  });

  it("denies a PARENT marking attendance (no ATTENDANCE_MARK)", async () => {
    const { ctx } = makeCtx(parent);
    await expect(openSession(ctx, openInput)).rejects.toThrow(ForbiddenError);
  });

  it("denies a TEACHER deciding leave / creating a holiday (no LEAVE_DECIDE / ACADEMIC_MANAGE)", async () => {
    const { ctx } = makeCtx(teacher);
    await expect(decideLeave(ctx, { leaveId: "lv-1", decision: "APPROVED" })).rejects.toThrow(ForbiddenError);
    await expect(
      createHoliday(ctx, { academicYearId: "y-1", name: "X", date: DATE, type: "SCHOOL" }),
    ).rejects.toThrow(ForbiddenError);
  });
});

/* ============================ state-machine matrix ============================ */
// The lifecycle is forward-only: DRAFT → SUBMITTED → LOCKED. There is NO revert
// operation, so backward transitions (LOCKED→DRAFT, LOCKED→SUBMITTED,
// SUBMITTED→DRAFT) are unrepresentable by design, not merely rejected. This
// matrix asserts every real operation × every current status.
describe("attendance — state machine matrix (submit/lock/mark × status)", () => {
  const cases = [
    { status: "DRAFT" as const, op: "submit" as const, ok: true },
    { status: "SUBMITTED" as const, op: "submit" as const, ok: false }, // submit twice
    { status: "LOCKED" as const, op: "submit" as const, ok: false },
    { status: "DRAFT" as const, op: "lock" as const, ok: false }, // lock before submit
    { status: "SUBMITTED" as const, op: "lock" as const, ok: true },
    { status: "LOCKED" as const, op: "lock" as const, ok: false }, // lock twice
    { status: "DRAFT" as const, op: "mark" as const, ok: true },
    { status: "SUBMITTED" as const, op: "mark" as const, ok: false },
    { status: "LOCKED" as const, op: "mark" as const, ok: false }, // mark after locked
  ];

  it.each(cases)("$op when $status → allowed=$ok", async ({ status, op, ok }) => {
    const { ctx, repos } = makeCtx(officeAdmin);
    repos.attendanceSessions.findById.mockResolvedValue({ ...sessionRow, status });
    const run = () =>
      op === "submit"
        ? submitSession(ctx, "ses-1")
        : op === "lock"
          ? lockSession(ctx, "ses-1")
          : markAttendance(ctx, { sessionId: "ses-1", marks: [{ enrollmentId: "e-1", status: "PRESENT" }] });
    if (ok) {
      await expect(run()).resolves.toBeDefined();
    } else {
      await expect(run()).rejects.toThrow(ValidationError);
    }
  });
});
