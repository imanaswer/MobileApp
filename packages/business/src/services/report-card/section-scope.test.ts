import { ForbiddenError } from "@repo/core";
import type { ClassTeacherAssignment, Enrollment, Repositories, ReportCard } from "@repo/db";
import { createNotificationService } from "@repo/notifications";
import { describe, expect, it, vi } from "vitest";

import type { Principal } from "../../authorization";
import type { ServiceContext } from "../../context";

import { listReportCardsForSection } from "./report-card.service";

/**
 * The section-scoped list is gated by the SAME check as listForEnrollment (isFullAccess
 * OR the ClassTeacherAssignment holder), lifted to section grain. This proves the fix's
 * load-bearing behaviour, which the API transport harness cannot (subject/class teacher
 * both hold REPORT_CARD_READ, so the decision happens at the repo-backed check, not assertCan).
 */

const admin: Principal = {
  userId: "u-office",
  schoolId: "s-1",
  role: "OFFICE_ADMIN",
  status: "ACTIVE",
};
/** U — the assigned class teacher of 5A, but teaches NO subject there (no TeacherAssignment). */
const classTeacher: Principal = {
  userId: "u-classteacher",
  schoolId: "s-1",
  role: "TEACHER",
  status: "ACTIVE",
};
/** T — teaches a subject in 5A but is NOT the class teacher. */
const subjectTeacher: Principal = {
  userId: "u-subjectteacher",
  schoolId: "s-1",
  role: "TEACHER",
  status: "ACTIVE",
};

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const stamps = { createdAt: d("2026-01-01"), updatedAt: d("2026-01-01") };

const enrollmentRow: Enrollment = {
  id: "e-1",
  schoolId: "s-1",
  studentId: "st-1",
  academicYearId: "y-1",
  classId: "cls-5",
  sectionId: "sec-5a",
  rollNo: 1,
  status: "ACTIVE",
  ...stamps,
};
/** (y-1, 5A) → U is the class teacher. */
const ctaRow: ClassTeacherAssignment = {
  id: "cta-1",
  schoolId: "s-1",
  academicYearId: "y-1",
  sectionId: "sec-5a",
  teacherId: "u-classteacher",
  assignedAt: d("2026-06-05"),
  createdByStaffId: "stf-office",
  ...stamps,
};
const cardRow: ReportCard = {
  id: "rc-1",
  schoolId: "s-1",
  enrollmentId: "e-1",
  kind: "ANNUAL",
  examId: null,
  termId: null,
  version: 1,
  status: "DRAFT",
  classTeacherRemark: null,
  principalRemark: null,
  promotionDecision: null,
  rank: null,
  rankScope: null,
  cohortSize: null,
  attendancePercentage: null,
  presentCount: null,
  absentCount: null,
  lateCount: null,
  halfDayCount: null,
  leaveCount: null,
  workingDays: null,
  gpaSnapshot: null,
  cgpaSnapshot: null,
  pdfPath: null,
  createdByStaffId: "stf-office",
  submittedByStaffId: null,
  submittedAt: null,
  approvedByStaffId: null,
  approvedAt: null,
  publishedByStaffId: null,
  publishedAt: null,
  reopenedByStaffId: null,
  reopenedAt: null,
  reopenReason: null,
  revokedByStaffId: null,
  revokedAt: null,
  revokeReason: null,
  ...stamps,
};

function makeCtx(user: Principal) {
  const repos = {
    classTeacherAssignments: {
      findBySectionYear: vi.fn(async (): Promise<ClassTeacherAssignment | null> => ctaRow),
    },
    enrollments: {
      listBySection: vi.fn(async (): Promise<Enrollment[]> => [enrollmentRow]),
    },
    students: {
      listByIds: vi.fn(async () => [{ id: "st-1", firstName: "Asha", lastName: "Nair" }]),
    },
    reportCards: {
      listByEnrollment: vi.fn(async (): Promise<ReportCard[]> => [cardRow]),
    },
  };
  const repositories = repos as unknown as Repositories;
  const ctx: ServiceContext = {
    user,
    repositories,
    notifications: createNotificationService([]),
    withTransaction: <T>(fn: (r: Repositories) => Promise<T>) => fn(repositories),
  };
  return ctx;
}

const input = { academicYearId: "y-1", sectionId: "sec-5a" };

describe("listReportCardsForSection — ClassTeacherAssignment gate", () => {
  it("admin (full access) sees the section's cards", async () => {
    const cards = await listReportCardsForSection(makeCtx(admin), input);
    expect(cards.map((c) => c.id)).toEqual(["rc-1"]);
  });

  it("the assigned class teacher sees the section's cards even with no subject there", async () => {
    const cards = await listReportCardsForSection(makeCtx(classTeacher), input);
    expect(cards.map((c) => c.id)).toEqual(["rc-1"]);
  });

  it("a subject teacher who is NOT the class teacher is refused", async () => {
    await expect(listReportCardsForSection(makeCtx(subjectTeacher), input)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
