import { ConflictError, ForbiddenError, ValidationError } from "@repo/core";
import type {
  AcademicYear,
  BellSchedule,
  Class,
  Enrollment,
  Parent,
  Period,
  Repositories,
  Section,
  Staff,
  Subject,
  TeacherAssignment,
  TimetableEntry,
} from "@repo/db";
import { createNotificationService } from "@repo/notifications";
import { describe, expect, it, vi } from "vitest";

import type { Principal } from "../../authorization";
import type { ServiceContext } from "../../context";

import { createBellSchedule } from "./bell-schedule.service";
import { createPeriod } from "./period.service";
import {
  createTimetableEntry,
  getParentTimetable,
  getSectionTimetable,
  getTeacherTimetable,
  updateTimetableEntry,
} from "./timetable.service";

/* ---- principals ---- */
const admin: Principal = {
  userId: "u-admin",
  schoolId: "s-1",
  role: "OFFICE_ADMIN",
  status: "ACTIVE",
};
const teacher: Principal = {
  userId: "u-teacher",
  schoolId: "s-1",
  role: "TEACHER",
  status: "ACTIVE",
};
const parent: Principal = { userId: "u-parent", schoolId: "s-1", role: "PARENT", status: "ACTIVE" };

/* ---- rows ---- */
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const t = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00.000Z`);
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
const subjectRow: Subject = { id: "subj-math", schoolId: "s-1", name: "Mathematics", ...stamps };
const staffRow: Staff = {
  id: "stf-1",
  schoolId: "s-1",
  userId: "u-teacher",
  name: "Meera Teacher",
  employeeId: "E-9",
  department: null,
  qualification: null,
  experienceYears: null,
  joiningDate: null,
  bio: null,
  photoPath: null,
  ...stamps,
};
const bellRow: BellSchedule = {
  id: "bs-1",
  schoolId: "s-1",
  academicYearId: "y-1",
  name: "Regular Day",
  ...stamps,
};
const periodRow: Period = {
  id: "p-1",
  schoolId: "s-1",
  bellScheduleId: "bs-1",
  name: "Period 1",
  order: 1,
  startTime: t("09:00"),
  endTime: t("09:45"),
  isBreak: false,
  ...stamps,
};
const assignmentRow: TeacherAssignment = {
  id: "ta-1",
  schoolId: "s-1",
  teacherId: "u-teacher",
  subjectId: "subj-math",
  sectionId: "sec-5a",
  createdAt: d("2026-01-01"),
};
const entryRow: TimetableEntry = {
  id: "te-1",
  schoolId: "s-1",
  academicYearId: "y-1",
  sectionId: "sec-5a",
  subjectId: "subj-math",
  teacherId: "u-teacher",
  periodId: "p-1",
  weekday: "MON",
  room: "R12",
  ...stamps,
};
const parentRow: Parent = {
  id: "par-1",
  schoolId: "s-1",
  userId: "u-parent",
  name: "Mom",
  phone: "9",
  email: null,
  occupation: null,
  address: null,
  preferredContact: "PHONE",
  ...stamps,
};
const childEnrollment: Enrollment = {
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

const validEntryInput = {
  academicYearId: "y-1",
  sectionId: "sec-5a",
  subjectId: "subj-math",
  teacherId: "u-teacher",
  periodId: "p-1",
  weekday: "MON",
};

function makeRepos() {
  return {
    audit: { record: vi.fn(async (): Promise<void> => undefined) },
    academicYears: {
      findById: vi.fn(async (): Promise<AcademicYear | null> => yearRow),
      findActive: vi.fn(async (): Promise<AcademicYear | null> => yearRow),
    },
    classes: { findById: vi.fn(async (): Promise<Class | null> => classRow) },
    sections: { findById: vi.fn(async (): Promise<Section | null> => sectionRow) },
    subjects: { findById: vi.fn(async (): Promise<Subject | null> => subjectRow) },
    staff: { findByUserId: vi.fn(async (): Promise<Staff | null> => staffRow) },
    parents: { findByUserId: vi.fn(async (): Promise<Parent | null> => parentRow) },
    studentParents: { studentIdsForParent: vi.fn(async (): Promise<string[]> => ["st-1"]) },
    enrollments: { listByStudent: vi.fn(async (): Promise<Enrollment[]> => [childEnrollment]) },
    teacherAssignments: {
      findByTriple: vi.fn(async (): Promise<TeacherAssignment | null> => assignmentRow),
    },
    bellSchedules: {
      findById: vi.fn(async (): Promise<BellSchedule | null> => bellRow),
      findByYear: vi.fn(async (): Promise<BellSchedule | null> => bellRow),
      create: vi.fn(async (): Promise<BellSchedule> => bellRow),
    },
    periods: {
      findById: vi.fn(async (): Promise<Period | null> => periodRow),
      listBySchedule: vi.fn(async (): Promise<Period[]> => [periodRow]),
      create: vi.fn(async (input: Partial<Period>): Promise<Period> => ({
        ...periodRow,
        ...input,
      })),
    },
    timetableEntries: {
      findById: vi.fn(async (): Promise<TimetableEntry | null> => entryRow),
      listBySection: vi.fn(async (): Promise<TimetableEntry[]> => [entryRow]),
      listByTeacher: vi.fn(async (): Promise<TimetableEntry[]> => [entryRow]),
      findBySectionSlot: vi.fn(async (): Promise<TimetableEntry | null> => null),
      findByTeacherSlot: vi.fn(async (): Promise<TimetableEntry | null> => null),
      existsForPeriod: vi.fn(async (): Promise<boolean> => false),
      create: vi.fn(async (input: Partial<TimetableEntry>): Promise<TimetableEntry> => ({
        ...entryRow,
        ...input,
      })),
      update: vi.fn(
        async (_id: string, input: Partial<TimetableEntry>): Promise<TimetableEntry> => ({
          ...entryRow,
          ...input,
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
 * CONFLICT MATRIX (ADR-017 §2) — the load-bearing rules.
 * ====================================================================== */
describe("timetable conflict matrix", () => {
  it("happy path: admin creates an entry, enriched + audited in-tx", async () => {
    const { ctx, repos } = makeCtx(admin);
    const dto = await createTimetableEntry(ctx, validEntryInput);
    expect(dto).toMatchObject({
      subjectName: "Mathematics",
      teacherName: "Meera Teacher",
      sectionName: "A",
      startTime: "09:00",
      endTime: "09:45",
      weekday: "MON",
    });
    expect(repos.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "TIMETABLE_ENTRY_CREATE", entityType: "TimetableEntry" }),
    );
  });

  it("SECTION overlap → ConflictError (a class already in this section/weekday/period)", async () => {
    const repos = makeRepos();
    repos.timetableEntries.findBySectionSlot.mockResolvedValueOnce({ ...entryRow, id: "other" });
    const { ctx } = makeCtx(admin, repos);
    await expect(createTimetableEntry(ctx, validEntryInput)).rejects.toThrow(ConflictError);
    expect(repos.timetableEntries.create).not.toHaveBeenCalled();
  });

  it("TEACHER overlap → ConflictError (teacher already booked this weekday/period elsewhere)", async () => {
    const repos = makeRepos();
    repos.timetableEntries.findByTeacherSlot.mockResolvedValueOnce({
      ...entryRow,
      id: "other",
      sectionId: "sec-5b",
    });
    const { ctx } = makeCtx(admin, repos);
    await expect(createTimetableEntry(ctx, validEntryInput)).rejects.toThrow(ConflictError);
    expect(repos.timetableEntries.create).not.toHaveBeenCalled();
  });

  it("DUPLICATE period is the section-slot rule (same section+weekday+period is one entry)", async () => {
    const repos = makeRepos();
    repos.timetableEntries.findBySectionSlot.mockResolvedValueOnce(entryRow);
    const { ctx } = makeCtx(admin, repos);
    await expect(createTimetableEntry(ctx, validEntryInput)).rejects.toThrow(ConflictError);
  });

  it("OWNERSHIP: teacher not assigned to this subject×section → ValidationError (never ClassTeacherAssignment)", async () => {
    const repos = makeRepos();
    repos.teacherAssignments.findByTriple.mockResolvedValueOnce(null);
    const { ctx } = makeCtx(admin, repos);
    await expect(createTimetableEntry(ctx, validEntryInput)).rejects.toThrow(ValidationError);
  });

  it("BREAK period holds no class → ValidationError", async () => {
    const repos = makeRepos();
    repos.periods.findById.mockResolvedValue({ ...periodRow, isBreak: true });
    const { ctx } = makeCtx(admin, repos);
    await expect(createTimetableEntry(ctx, validEntryInput)).rejects.toThrow(ValidationError);
  });

  it("CROSS-YEAR: period's bell schedule belongs to another year → ValidationError", async () => {
    const repos = makeRepos();
    repos.bellSchedules.findById.mockResolvedValueOnce({ ...bellRow, academicYearId: "y-2" });
    const { ctx } = makeCtx(admin, repos);
    await expect(createTimetableEntry(ctx, validEntryInput)).rejects.toThrow(ValidationError);
  });

  it("UPDATE excludes self: the only clashing slot is the row being edited → allowed", async () => {
    const repos = makeRepos();
    // both slot lookups return THIS entry (te-1) — must not count as a conflict on its own update
    repos.timetableEntries.findBySectionSlot.mockResolvedValue(entryRow);
    repos.timetableEntries.findByTeacherSlot.mockResolvedValue(entryRow);
    const { ctx } = makeCtx(admin, repos);
    await expect(updateTimetableEntry(ctx, "te-1", { room: "R99" })).resolves.toMatchObject({
      room: "R99",
    });
  });
});

/* ========================================================================
 * AUTHORIZATION — management is admin-only (TIMETABLE_MANAGE).
 * ====================================================================== */
describe("timetable authorization", () => {
  it("a TEACHER cannot create an entry (ForbiddenError — no TIMETABLE_MANAGE)", async () => {
    const { ctx, repos } = makeCtx(teacher);
    await expect(createTimetableEntry(ctx, validEntryInput)).rejects.toThrow(ForbiddenError);
    expect(repos.timetableEntries.create).not.toHaveBeenCalled();
  });

  it("a PARENT cannot create an entry (ForbiddenError)", async () => {
    const { ctx } = makeCtx(parent);
    await expect(createTimetableEntry(ctx, validEntryInput)).rejects.toThrow(ForbiddenError);
  });
});

/* ========================================================================
 * PERIODS + BELL SCHEDULE validation.
 * ====================================================================== */
describe("period + bell schedule rules", () => {
  const periodInput = {
    bellScheduleId: "bs-1",
    name: "P2",
    order: 2,
    startTime: "09:45",
    endTime: "10:30",
    isBreak: false,
  };

  it("overlapping a sibling period → ConflictError", async () => {
    const { ctx } = makeCtx(admin); // sibling p-1 is 09:00–09:45
    await expect(
      createPeriod(ctx, { ...periodInput, startTime: "09:30", endTime: "10:15" }),
    ).rejects.toThrow(ConflictError);
  });

  it("duplicate order in the schedule → ConflictError", async () => {
    const { ctx } = makeCtx(admin); // sibling p-1 has order 1
    await expect(createPeriod(ctx, { ...periodInput, order: 1 })).rejects.toThrow(ConflictError);
  });

  it("start ≥ end → ValidationError", async () => {
    const { ctx } = makeCtx(admin);
    await expect(
      createPeriod(ctx, { ...periodInput, startTime: "10:30", endTime: "09:45" }),
    ).rejects.toThrow(ValidationError);
  });

  it("order ≤ 0 → ValidationError", async () => {
    const { ctx } = makeCtx(admin);
    await expect(createPeriod(ctx, { ...periodInput, order: 0 })).rejects.toThrow(ValidationError);
  });

  it("a non-break period well outside siblings is created", async () => {
    const { ctx, repos } = makeCtx(admin);
    await expect(createPeriod(ctx, periodInput)).resolves.toMatchObject({ name: "P2" });
    expect(repos.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "PERIOD_CREATE" }),
    );
  });

  it("one bell schedule per year → ConflictError on a second create", async () => {
    const { ctx } = makeCtx(admin); // findByYear returns bellRow (exists)
    await expect(
      createBellSchedule(ctx, { academicYearId: "y-1", name: "Second" }),
    ).rejects.toThrow(ConflictError);
  });
});

/* ========================================================================
 * READS — enrichment, role scope, active-year default.
 * ====================================================================== */
describe("timetable reads", () => {
  it("teacher reads OWN grid (teacherId defaults to caller); enriched", async () => {
    const { ctx } = makeCtx(teacher);
    const rows = await getTeacherTimetable(ctx);
    expect(rows[0]).toMatchObject({ teacherName: "Meera Teacher", subjectName: "Mathematics" });
  });

  it("a teacher may NOT read another teacher's grid → ValidationError", async () => {
    const { ctx } = makeCtx(teacher);
    await expect(getTeacherTimetable(ctx, { teacherId: "u-other" })).rejects.toThrow(
      ValidationError,
    );
  });

  it("active-year default: no active year → ValidationError", async () => {
    const repos = makeRepos();
    repos.academicYears.findActive.mockResolvedValueOnce(null);
    const { ctx } = makeCtx(teacher, repos);
    await expect(getTeacherTimetable(ctx)).rejects.toThrow(ValidationError);
  });

  it("parent reads only their child's section grid", async () => {
    const { ctx, repos } = makeCtx(parent);
    const rows = await getParentTimetable(ctx);
    expect(repos.timetableEntries.listBySection).toHaveBeenCalledWith("y-1", "sec-5a");
    expect(rows[0]).toMatchObject({ sectionName: "A" });
  });

  it("parent CANNOT read a section none of their children are in → ForbiddenError", async () => {
    const { ctx } = makeCtx(parent); // child is in sec-5a, not sec-5b
    await expect(
      getSectionTimetable(ctx, { academicYearId: "y-1", sectionId: "sec-5b" }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("admin reads any section grid", async () => {
    const { ctx } = makeCtx(admin);
    await expect(
      getSectionTimetable(ctx, { academicYearId: "y-1", sectionId: "sec-5a" }),
    ).resolves.toHaveLength(1);
  });
});
