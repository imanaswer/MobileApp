import { describe, expect, it } from "vitest";

import {
  applyLeaveInput,
  attendanceRangeInput,
  createHolidayInput,
  decideLeaveInput,
  findSessionInput,
  markAttendanceInput,
  openSessionInput,
} from "./index";

/** M4 attendance input schemas — shape/edge validation (rules live in services). */

describe("openSessionInput", () => {
  const base = { academicYearId: "y-1", sectionId: "sec-1", sessionType: "DAILY" as const };

  it("transforms a valid YYYY-MM-DD date to a Date", () => {
    const parsed = openSessionInput.parse({ ...base, date: "2026-08-01" });
    expect(parsed.date).toBeInstanceOf(Date);
    expect(parsed.date.toISOString().slice(0, 10)).toBe("2026-08-01");
  });

  it("rejects an impossible calendar date", () => {
    expect(openSessionInput.safeParse({ ...base, date: "2026-02-30" }).success).toBe(false);
  });

  it("rejects a non-enum session type", () => {
    expect(openSessionInput.safeParse({ ...base, sessionType: "WEEKLY", date: "2026-08-01" }).success).toBe(false);
  });

  it("allows an optional subjectId (SUBJECT sessions)", () => {
    const parsed = openSessionInput.parse({ ...base, sessionType: "SUBJECT", subjectId: "sub-1", date: "2026-08-01" });
    expect(parsed.subjectId).toBe("sub-1");
  });
});

describe("markAttendanceInput", () => {
  it("requires at least one mark", () => {
    expect(markAttendanceInput.safeParse({ sessionId: "ses-1", marks: [] }).success).toBe(false);
  });

  it("accepts valid statuses and optional remarks", () => {
    const parsed = markAttendanceInput.parse({
      sessionId: "ses-1",
      marks: [{ enrollmentId: "e-1", status: "HALF_DAY", remarks: "left early" }],
    });
    expect(parsed.marks[0]).toMatchObject({ status: "HALF_DAY", remarks: "left early" });
  });

  it("rejects an unknown status", () => {
    expect(
      markAttendanceInput.safeParse({ sessionId: "ses-1", marks: [{ enrollmentId: "e-1", status: "PRSENT" }] }).success,
    ).toBe(false);
  });
});

describe("applyLeaveInput", () => {
  it("transforms both dates and keeps a trimmed reason", () => {
    const parsed = applyLeaveInput.parse({ enrollmentId: "e-1", fromDate: "2026-08-05", toDate: "2026-08-06", reason: "  fever " });
    expect(parsed.fromDate).toBeInstanceOf(Date);
    expect(parsed.reason).toBe("fever");
  });

  it("rejects an empty reason", () => {
    expect(applyLeaveInput.safeParse({ enrollmentId: "e-1", fromDate: "2026-08-05", toDate: "2026-08-06", reason: "" }).success).toBe(false);
  });
});

describe("decideLeaveInput / attendanceRangeInput / findSessionInput / createHolidayInput", () => {
  it("constrains the decision to APPROVED/REJECTED", () => {
    expect(decideLeaveInput.safeParse({ leaveId: "lv-1", decision: "PENDING" }).success).toBe(false);
    expect(decideLeaveInput.parse({ leaveId: "lv-1", decision: "APPROVED" }).decision).toBe("APPROVED");
  });

  it("parses a date range", () => {
    const parsed = attendanceRangeInput.parse({ enrollmentId: "e-1", from: "2026-08-01", to: "2026-08-31" });
    expect(parsed.from).toBeInstanceOf(Date);
  });

  it("parses a session lookup", () => {
    expect(findSessionInput.parse({ sectionId: "sec-1", sessionType: "DAILY", date: "2026-08-01" }).date).toBeInstanceOf(Date);
  });

  it("constrains the holiday type enum", () => {
    expect(createHolidayInput.safeParse({ academicYearId: "y-1", name: "X", date: "2026-11-01", type: "BANK" }).success).toBe(false);
    expect(createHolidayInput.parse({ academicYearId: "y-1", name: "Diwali", date: "2026-11-01", type: "FESTIVAL" }).type).toBe("FESTIVAL");
  });
});
