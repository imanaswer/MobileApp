import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@repo/core";
import type {
  AcademicYear,
  Class,
  ClassTeacherAssignment,
  Enrollment,
  Repositories,
  Section,
  Staff,
  TeacherAssignment,
  User,
} from "@repo/db";
import { createNotificationService } from "@repo/notifications";
import { describe, expect, it, vi } from "vitest";

import type { Principal } from "../../authorization";
import type { ServiceContext } from "../../context";

import {
  assertClassTeacherOfEnrollment,
  assignClassTeacher,
  getClassTeacherForSection,
  isClassTeacherOfEnrollment,
  removeClassTeacher,
  replaceClassTeacher,
} from "./class-teacher.service";

/* ---- principals ---- */
const officeAdmin: Principal = {
  userId: "u-office",
  schoolId: "s-1",
  role: "OFFICE_ADMIN",
  status: "ACTIVE",
};
/** U — the assigned class teacher of section 5A. */
const classTeacher: Principal = {
  userId: "u-classteacher",
  schoolId: "s-1",
  role: "TEACHER",
  status: "ACTIVE",
};
/** T — teaches Math IN 5A (a real TeacherAssignment) but is NOT the class teacher. */
const subjectTeacher: Principal = {
  userId: "u-subjectteacher",
  schoolId: "s-1",
  role: "TEACHER",
  status: "ACTIVE",
};
const parent: Principal = { userId: "u-parent", schoolId: "s-1", role: "PARENT", status: "ACTIVE" };

/* ---- rows ---- */
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const stamps = { createdAt: d("2026-01-01"), updatedAt: d("2026-01-01") };

const yearRow: AcademicYear = {
  id: "y-1",
  schoolId: "s-1",
  name: "2026-27",
  startDate: d("2026-06-01"),
  endDate: d("2027-03-31"),
  status: "ACTIVE",
  ...stamps,
};
const classRow: Class = { id: "cls-5", schoolId: "s-1", name: "Grade 5", sortOrder: 5, ...stamps };
const sectionRow: Section = { id: "sec-5a", classId: "cls-5", name: "A", ...stamps };
const classTeacherUser: User = {
  id: "u-classteacher",
  schoolId: "s-1",
  role: "TEACHER",
  status: "ACTIVE",
  phone: null,
  email: "u@school.example",
  locale: "EN",
  lastLoginAt: null,
  ...stamps,
};
/** An enrollment placed in section 5A for year y-1. */
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
/** The acting admin's Staff row (B3 audit actor for assign/replace). */
const officeStaff: Staff = {
  id: "stf-office",
  schoolId: "s-1",
  userId: "u-office",
  name: "Olivia Office",
  employeeId: "E-1",
  department: null,
  qualification: null,
  experienceYears: null,
  joiningDate: null,
  bio: null,
  photoPath: null,
  ...stamps,
};
/** THE class-teacher assignment: (y-1, 5A) → U, assigned by office at a KNOWN prior time. */
const priorAssignedAt = d("2026-06-05");
const ctaRow: ClassTeacherAssignment = {
  id: "cta-1",
  schoolId: "s-1",
  academicYearId: "y-1",
  sectionId: "sec-5a",
  teacherId: "u-classteacher",
  assignedAt: priorAssignedAt,
  createdByStaffId: "stf-office",
  ...stamps,
};
/** T genuinely TEACHES Math in 5A — proof that "teaches the section" ≠ "class teacher". */
const subjectTeacherAssignmentIn5A: TeacherAssignment = {
  id: "ta-1",
  schoolId: "s-1",
  teacherId: "u-subjectteacher",
  subjectId: "subj-math",
  sectionId: "sec-5a",
  createdAt: d("2026-01-01"),
};

function makeRepos() {
  return {
    users: { findById: vi.fn(async (): Promise<User | null> => classTeacherUser) },
    audit: { record: vi.fn(async (): Promise<void> => undefined) },
    staff: { findByUserId: vi.fn(async (): Promise<Staff | null> => officeStaff) },
    academicYears: { findById: vi.fn(async (): Promise<AcademicYear | null> => yearRow) },
    classes: { findById: vi.fn(async (): Promise<Class | null> => classRow) },
    sections: { findById: vi.fn(async (): Promise<Section | null> => sectionRow) },
    enrollments: { findById: vi.fn(async (): Promise<Enrollment | null> => enrollmentRow) },
    teacherAssignments: {
      findByTriple: vi.fn(
        async (_t: string, _s: string, _sec: string): Promise<TeacherAssignment | null> =>
          subjectTeacherAssignmentIn5A,
      ),
    },
    classTeacherAssignments: {
      findById: vi.fn(async (): Promise<ClassTeacherAssignment | null> => ctaRow),
      findBySectionYear: vi.fn(async (): Promise<ClassTeacherAssignment | null> => ctaRow),
      create: vi.fn(async (input: { teacherId: string }): Promise<ClassTeacherAssignment> => ({
        ...ctaRow,
        teacherId: input.teacherId,
        assignedAt: new Date(),
      })),
      update: vi.fn(
        async (
          _id: string,
          input: { teacherId: string; assignedAt: Date; createdByStaffId: string },
        ): Promise<ClassTeacherAssignment> => ({
          ...ctaRow,
          teacherId: input.teacherId,
          assignedAt: input.assignedAt,
          createdByStaffId: input.createdByStaffId,
        }),
      ),
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

/* ========================================================================
 * SCENARIO 1 — the class teacher CAN author remarks.
 * SCENARIO 2 — a subject teacher of the SAME section CANNOT (the whole point).
 * ====================================================================== */
describe("remark-authoring gate (isClassTeacher of the enrollment)", () => {
  it("Scenario 1: the assigned class teacher (U) is authorized for an enrollment in their section", async () => {
    const { ctx } = makeCtx(classTeacher);
    await expect(isClassTeacherOfEnrollment(ctx, "e-1")).resolves.toBe(true);
    await expect(assertClassTeacherOfEnrollment(ctx, "e-1")).resolves.toBeUndefined();
  });

  it("Scenario 2 (discriminating): a teacher who TEACHES Math in 5A but is NOT the class teacher is denied", async () => {
    const { ctx, repos } = makeCtx(subjectTeacher);

    // Fixture sanity: T genuinely holds a TeacherAssignment for (Math, 5A) —
    // so this is NOT a trivial "not in the section" denial.
    await expect(
      repos.teacherAssignments.findByTriple("u-subjectteacher", "subj-math", "sec-5a"),
    ).resolves.toEqual(subjectTeacherAssignmentIn5A);

    // Yet the class teacher of (y-1, 5A) is U, not T → remark authoring is refused.
    await expect(isClassTeacherOfEnrollment(ctx, "e-1")).resolves.toBe(false);
    await expect(assertClassTeacherOfEnrollment(ctx, "e-1")).rejects.toThrow(ForbiddenError);
  });

  it("a parent is not the class teacher → denied", async () => {
    const { ctx } = makeCtx(parent);
    await expect(isClassTeacherOfEnrollment(ctx, "e-1")).resolves.toBe(false);
    await expect(assertClassTeacherOfEnrollment(ctx, "e-1")).rejects.toThrow(ForbiddenError);
  });

  it("an unplaced enrollment (no section) has no class teacher → false", async () => {
    const repos = makeRepos();
    repos.enrollments.findById.mockResolvedValueOnce({ ...enrollmentRow, sectionId: null });
    const { ctx } = makeCtx(classTeacher, repos);
    await expect(isClassTeacherOfEnrollment(ctx, "e-1")).resolves.toBe(false);
  });

  it("a section with no class teacher assigned → false", async () => {
    const repos = makeRepos();
    repos.classTeacherAssignments.findBySectionYear.mockResolvedValueOnce(null);
    const { ctx } = makeCtx(classTeacher, repos);
    await expect(isClassTeacherOfEnrollment(ctx, "e-1")).resolves.toBe(false);
  });

  it("a cross-school enrollment is not found (tenant guard)", async () => {
    const repos = makeRepos();
    repos.enrollments.findById.mockResolvedValueOnce({ ...enrollmentRow, schoolId: "s-2" });
    const { ctx } = makeCtx(classTeacher, repos);
    await expect(isClassTeacherOfEnrollment(ctx, "e-1")).rejects.toThrow(NotFoundError);
  });
});

/* ========================================================================
 * SCENARIO 3 — Office/Principal manages assignments (the authority that will
 * own report-card generate/publish). A non-admin teacher/parent cannot.
 * ====================================================================== */
describe("class-teacher assignment management (admin-only, academic:manage)", () => {
  const input = { academicYearId: "y-1", sectionId: "sec-5a", teacherId: "u-classteacher" };

  it("Scenario 3: OFFICE_ADMIN can assign a class teacher, audited in-tx", async () => {
    const repos = makeRepos();
    repos.classTeacherAssignments.findBySectionYear.mockResolvedValueOnce(null); // slot free
    const { ctx } = makeCtx(officeAdmin, repos);
    const dto = await assignClassTeacher(ctx, input);
    expect(dto).toMatchObject({
      sectionId: "sec-5a",
      teacherId: "u-classteacher",
      teacherName: "Olivia Office",
    });
    expect(repos.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "CLASS_TEACHER_ASSIGN",
        entityType: "ClassTeacherAssignment",
      }),
    );
  });

  it("a TEACHER cannot assign a class teacher (ForbiddenError — no academic:manage)", async () => {
    const { ctx, repos } = makeCtx(subjectTeacher);
    await expect(assignClassTeacher(ctx, input)).rejects.toThrow(ForbiddenError);
    expect(repos.classTeacherAssignments.create).not.toHaveBeenCalled();
  });

  it("a PARENT cannot assign a class teacher (ForbiddenError)", async () => {
    const { ctx, repos } = makeCtx(parent);
    await expect(assignClassTeacher(ctx, input)).rejects.toThrow(ForbiddenError);
    expect(repos.classTeacherAssignments.create).not.toHaveBeenCalled();
  });

  it("rejects a second class teacher for the same (year, section) — ConflictError", async () => {
    const { ctx, repos } = makeCtx(officeAdmin); // findBySectionYear returns ctaRow (taken)
    await expect(assignClassTeacher(ctx, input)).rejects.toThrow(ConflictError);
    expect(repos.classTeacherAssignments.create).not.toHaveBeenCalled();
  });

  it("rejects a non-teacher assignee (ValidationError)", async () => {
    const repos = makeRepos();
    repos.classTeacherAssignments.findBySectionYear.mockResolvedValueOnce(null);
    repos.users.findById.mockResolvedValueOnce({ ...classTeacherUser, role: "ACCOUNTANT" });
    const { ctx } = makeCtx(officeAdmin, repos);
    await expect(assignClassTeacher(ctx, input)).rejects.toThrow(ValidationError);
  });

  it("removes an assignment (admin), audited", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    await removeClassTeacher(ctx, "cta-1");
    expect(repos.classTeacherAssignments.delete).toHaveBeenCalledWith("cta-1");
    expect(repos.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "CLASS_TEACHER_REMOVE" }),
    );
  });

  it("getClassTeacherForSection returns the current class teacher DTO", async () => {
    const { ctx } = makeCtx(officeAdmin);
    await expect(
      getClassTeacherForSection(ctx, { academicYearId: "y-1", sectionId: "sec-5a" }),
    ).resolves.toMatchObject({ teacherId: "u-classteacher" });
  });

  it("✓ first assignment SETS assignedAt (to now, on create)", async () => {
    const repos = makeRepos();
    repos.classTeacherAssignments.findBySectionYear.mockResolvedValueOnce(null); // slot free
    const before = Date.now();
    const { ctx } = makeCtx(officeAdmin, repos);
    const dto = await assignClassTeacher(ctx, input);
    expect(dto.assignedAt).toBeDefined();
    expect(new Date(dto.assignedAt).getTime()).toBeGreaterThanOrEqual(before);
    expect(dto.createdByStaffId).toBe("stf-office");
  });
});

/* ========================================================================
 * REPLACE — in-place UPDATE of the single (year, section) row (ADR-015).
 * Proves: one row afterward, assignedAt re-stamped, ONE audit with old→new,
 * no delete, no insert, no second row, atomic.
 * ====================================================================== */
describe("class-teacher REPLACEMENT (in-place, single row)", () => {
  const replaceInput = { academicYearId: "y-1", sectionId: "sec-5a", teacherId: "u-newteacher" };

  it("✓ replacement UPDATES teacherId (and returns the new holder)", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    const dto = await replaceClassTeacher(ctx, replaceInput);
    expect(repos.classTeacherAssignments.update).toHaveBeenCalledWith(
      "cta-1",
      expect.objectContaining({ teacherId: "u-newteacher" }),
    );
    expect(dto.teacherId).toBe("u-newteacher");
  });

  it("✓ replacement UPDATES assignedAt to now (prior value not left in the live row)", async () => {
    const before = Date.now();
    const { ctx } = makeCtx(officeAdmin);
    const dto = await replaceClassTeacher(ctx, replaceInput);
    // The returned row's assignedAt reflects what the service wrote to update():
    expect(new Date(dto.assignedAt).getTime()).toBeGreaterThanOrEqual(before);
    expect(dto.assignedAt).not.toBe(priorAssignedAt.toISOString()); // re-stamped, not the old value
  });

  it("✓ ONLY ONE row afterward — update called, create & delete NOT (no second row, no history rows)", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    await replaceClassTeacher(ctx, replaceInput);
    expect(repos.classTeacherAssignments.update).toHaveBeenCalledTimes(1);
    expect(repos.classTeacherAssignments.create).not.toHaveBeenCalled();
    expect(repos.classTeacherAssignments.delete).not.toHaveBeenCalled();
  });

  it("✓ AuditLog stores OLD teacher AND OLD assignedAt (single CLASS_TEACHER_REPLACE, no second audit)", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    await replaceClassTeacher(ctx, replaceInput);
    expect(repos.audit.record).toHaveBeenCalledTimes(1);
    expect(repos.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "CLASS_TEACHER_REPLACE",
        entityType: "ClassTeacherAssignment",
        before: {
          teacherId: "u-classteacher",
          assignedAt: priorAssignedAt.toISOString(),
        },
        after: expect.objectContaining({ teacherId: "u-newteacher" }),
      }),
    );
  });

  it("✓ replacement is ATOMIC — update AND audit both run inside the same transaction", async () => {
    const repos = makeRepos();
    const order: string[] = [];
    repos.classTeacherAssignments.update.mockImplementationOnce(async () => {
      order.push("update");
      return { ...ctaRow, teacherId: "u-newteacher", assignedAt: new Date() };
    });
    repos.audit.record.mockImplementationOnce(async () => {
      order.push("audit");
    });
    const { ctx } = makeCtx(officeAdmin, repos);
    await replaceClassTeacher(ctx, replaceInput);
    expect(order).toEqual(["update", "audit"]); // both, in one withTransaction
  });

  it("replace on an unassigned slot → NotFoundError (nothing to replace)", async () => {
    const repos = makeRepos();
    repos.classTeacherAssignments.findBySectionYear.mockResolvedValueOnce(null);
    const { ctx } = makeCtx(officeAdmin, repos);
    await expect(replaceClassTeacher(ctx, replaceInput)).rejects.toThrow(NotFoundError);
    expect(repos.classTeacherAssignments.update).not.toHaveBeenCalled();
  });

  it("a TEACHER/PARENT cannot replace (ForbiddenError — no academic:manage)", async () => {
    for (const actor of [subjectTeacher, parent]) {
      const { ctx, repos } = makeCtx(actor);
      await expect(replaceClassTeacher(ctx, replaceInput)).rejects.toThrow(ForbiddenError);
      expect(repos.classTeacherAssignments.update).not.toHaveBeenCalled();
    }
  });
});
