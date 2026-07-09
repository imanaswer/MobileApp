import { ConflictError, ForbiddenError, ValidationError } from "@repo/core";
import type {
  Assessment,
  Enrollment,
  Exam,
  ExamSection,
  GradeScaleWithBands,
  Mark,
  Repositories,
  Staff,
} from "@repo/db";
import { createNotificationService } from "@repo/notifications";
import { describe, expect, it, vi } from "vitest";

import type { Principal } from "../../authorization";
import type { ServiceContext } from "../../context";

import { gpaForEnrollment } from "./grade.service";
import {
  lockRegister,
  marksForEnrollment,
  saveMarks,
  submitRegister,
  unlockRegister,
} from "./mark.service";

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

const stamps = { createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01") };
const staffRow = { id: "sf-1", schoolId: "s-1", userId: "u-teacher" } as unknown as Staff;
const assessment = {
  id: "as-1",
  schoolId: "s-1",
  examId: "ex-1",
  subjectId: "sub-1",
  maxTheory: 80,
  maxPractical: 20,
  passMark: 30,
  displayOrder: 0,
  ...stamps,
} as Assessment;
const exam = {
  id: "ex-1",
  schoolId: "s-1",
  academicYearId: "y-1",
  gradeScaleId: "gs-1",
  name: "T1",
  type: "ANNUAL",
  displayOrder: 0,
  startDate: null,
  endDate: null,
  isPublished: false,
  publishedAt: null,
  publishedByStaffId: null,
  ...stamps,
} as Exam;
const enrollment = {
  id: "e-1",
  schoolId: "s-1",
  studentId: "st-1",
  academicYearId: "y-1",
  classId: "c-1",
  sectionId: "sec-1",
  rollNo: 1,
  status: "ACTIVE",
  ...stamps,
} as Enrollment;
const draftRegister = {
  id: "es-1",
  schoolId: "s-1",
  assessmentId: "as-1",
  sectionId: "sec-1",
  status: "DRAFT",
  createdByStaffId: "sf-1",
  submittedByStaffId: null,
  lockedByStaffId: null,
  submittedAt: null,
  lockedAt: null,
  unlockedByStaffId: null,
  unlockedAt: null,
  unlockReason: null,
  ...stamps,
} as ExamSection;
const markRow = {
  id: "mk-1",
  schoolId: "s-1",
  examSectionId: "es-1",
  assessmentId: "as-1",
  enrollmentId: "e-1",
  theoryObtained: 70,
  practicalObtained: 15,
  isAbsent: false,
  totalObtained: null,
  percentage: null,
  gradeBandId: null,
  gradeLetterSnapshot: null,
  gradePointSnapshot: null,
  enteredByStaffId: "sf-1",
  ...stamps,
} as Mark;
const scale = {
  id: "gs-1",
  schoolId: "s-1",
  name: "SCERT",
  isDefault: true,
  ...stamps,
  bands: [
    {
      id: "b-e",
      gradeScaleId: "gs-1",
      grade: "E",
      minPercent: 0,
      maxPercent: 35,
      gradePoint: 0,
      ...stamps,
    },
    {
      id: "b-a",
      gradeScaleId: "gs-1",
      grade: "A",
      minPercent: 60,
      maxPercent: 90,
      gradePoint: 3,
      ...stamps,
    },
    {
      id: "b-ap",
      gradeScaleId: "gs-1",
      grade: "A+",
      minPercent: 90,
      maxPercent: 100.01,
      gradePoint: 4,
      ...stamps,
    },
  ],
} as GradeScaleWithBands;

function makeRepos(over: Record<string, unknown> = {}) {
  const base = {
    audit: { record: vi.fn(async (): Promise<void> => undefined) },
    staff: { findByUserId: vi.fn(async (): Promise<Staff | null> => staffRow) },
    teacherAssignments: {
      findByTriple: vi.fn(async (t: string, s: string, sec: string) =>
        t === "u-teacher" && s === "sub-1" && sec === "sec-1" ? { id: "ta-1" } : null,
      ),
      list: vi.fn(async () => [{ sectionId: "sec-1" }]),
    },
    parents: { findByUserId: vi.fn(async () => ({ id: "p-1" })) },
    studentParents: { studentIdsForParent: vi.fn(async (): Promise<string[]> => ["st-1"]) },
    assessments: { findById: vi.fn(async (): Promise<Assessment | null> => assessment) },
    exams: { findById: vi.fn(async (): Promise<Exam | null> => exam) },
    subjects: { findById: vi.fn(async () => ({ id: "sub-1", schoolId: "s-1", name: "Math" })) },
    sections: { findById: vi.fn(async () => ({ id: "sec-1", classId: "c-1", name: "A" })) },
    enrollments: { findById: vi.fn(async (): Promise<Enrollment | null> => enrollment) },
    gradeScales: {
      findByIdWithBands: vi.fn(async (): Promise<GradeScaleWithBands | null> => scale),
      findDefaultWithBands: vi.fn(async (): Promise<GradeScaleWithBands | null> => scale),
    },
    examSections: {
      findById: vi.fn(async (): Promise<ExamSection | null> => draftRegister),
      findByAssessmentSection: vi.fn(async (): Promise<ExamSection | null> => draftRegister),
      create: vi.fn(async (): Promise<ExamSection> => draftRegister),
      ensure: vi.fn(async (): Promise<ExamSection> => draftRegister),
      transition: vi.fn(
        async (
          _id: string,
          _from: string,
          data: Partial<ExamSection>,
        ): Promise<ExamSection | null> => ({
          ...draftRegister,
          ...data,
        }),
      ),
    },
    marks: {
      findById: vi.fn(async (): Promise<Mark | null> => markRow),
      listByExamSection: vi.fn(async (): Promise<Mark[]> => [markRow]),
      listByEnrollment: vi.fn(async (): Promise<Mark[]> => [markRow]),
      listPublishedByEnrollment: vi.fn(async (): Promise<Mark[]> => [
        { ...markRow, gradePointSnapshot: 4 },
      ]),
      upsert: vi.fn(async (input: { enrollmentId: string; isAbsent: boolean }): Promise<Mark> => ({
        ...markRow,
        enrollmentId: input.enrollmentId,
        isAbsent: input.isAbsent,
      })),
      writeSnapshot: vi.fn(async (id: string, snap: Partial<Mark>): Promise<Mark> => ({
        ...markRow,
        id,
        ...snap,
      })),
    },
    ...over,
  };
  return base;
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

const entry = { enrollmentId: "e-1", theoryObtained: 70, practicalObtained: 15 };

describe("saveMarks — teacher ownership + validation", () => {
  it("teacher saves own assessment×section (auto-creates register, audits)", async () => {
    const { ctx, repos } = makeCtx(
      teacher,
      makeRepos({
        examSections: {
          findByAssessmentSection: vi.fn(async (): Promise<ExamSection | null> => null),
          ensure: vi.fn(async (): Promise<ExamSection> => draftRegister),
        },
      }),
    );
    const out = await saveMarks(ctx, { assessmentId: "as-1", sectionId: "sec-1", marks: [entry] });
    expect(out).toHaveLength(1);
    expect(repos.examSections.ensure).toHaveBeenCalledTimes(1);
    expect(repos.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "MARK_SAVE" }),
    );
  });

  it("teacher marking a NON-owned section → Forbidden", async () => {
    const { ctx } = makeCtx(teacher);
    await expect(
      saveMarks(ctx, { assessmentId: "as-1", sectionId: "sec-OTHER", marks: [entry] }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("marks over the maximum → Validation (R4)", async () => {
    const { ctx } = makeCtx(teacher);
    await expect(
      saveMarks(ctx, {
        assessmentId: "as-1",
        sectionId: "sec-1",
        marks: [{ enrollmentId: "e-1", theoryObtained: 500 }],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("absent mark carrying obtained values → Validation", async () => {
    const { ctx } = makeCtx(teacher);
    await expect(
      saveMarks(ctx, {
        assessmentId: "as-1",
        sectionId: "sec-1",
        marks: [{ enrollmentId: "e-1", isAbsent: true, theoryObtained: 10 }],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("practical on a theory-only assessment → Validation", async () => {
    const { ctx } = makeCtx(
      teacher,
      makeRepos({
        assessments: { findById: vi.fn(async () => ({ ...assessment, maxPractical: null })) },
      }),
    );
    await expect(
      saveMarks(ctx, {
        assessmentId: "as-1",
        sectionId: "sec-1",
        marks: [{ enrollmentId: "e-1", theoryObtained: 5, practicalObtained: 3 }],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("cross-year enrollment → Validation (ADR-012 §10)", async () => {
    const { ctx } = makeCtx(
      teacher,
      makeRepos({
        enrollments: {
          findById: vi.fn(async () => ({ ...enrollment, academicYearId: "y-OTHER" })),
        },
      }),
    );
    await expect(
      saveMarks(ctx, { assessmentId: "as-1", sectionId: "sec-1", marks: [entry] }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("editing a LOCKED register → Validation (published marks immutable)", async () => {
    const { ctx } = makeCtx(
      teacher,
      makeRepos({
        examSections: {
          findByAssessmentSection: vi.fn(async () => ({ ...draftRegister, status: "LOCKED" })),
        },
      }),
    );
    await expect(
      saveMarks(ctx, { assessmentId: "as-1", sectionId: "sec-1", marks: [entry] }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("lifecycle — submit / lock / unlock", () => {
  it("teacher submits own register (DRAFT→SUBMITTED)", async () => {
    const { ctx } = makeCtx(teacher);
    const dto = await submitRegister(ctx, "es-1");
    expect(dto.status).toBe("SUBMITTED");
  });

  it("teacher CANNOT lock (needs admin EXAM_MANAGE) → Forbidden", async () => {
    const { ctx } = makeCtx(
      teacher,
      makeRepos({
        examSections: { findById: vi.fn(async () => ({ ...draftRegister, status: "SUBMITTED" })) },
      }),
    );
    await expect(lockRegister(ctx, "es-1")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("admin locks: computes + snapshots grade, one audit (SUBMITTED→LOCKED)", async () => {
    const submitted = { ...draftRegister, status: "SUBMITTED" as const };
    const repos = makeRepos({
      examSections: {
        findById: vi.fn(async () => submitted),
        transition: vi.fn(async (_id: string, _f: string, d: Partial<ExamSection>) => ({
          ...submitted,
          ...d,
        })),
      },
    });
    const { ctx } = makeCtx(admin, repos);
    const dto = await lockRegister(ctx, "es-1");
    expect(dto.status).toBe("LOCKED");
    // 70+15=85/100 = 85% → A (gradePoint 3)
    expect(repos.marks.writeSnapshot).toHaveBeenCalledWith(
      "mk-1",
      expect.objectContaining({ percentage: 85, gradeLetterSnapshot: "A", gradePointSnapshot: 3 }),
    );
    expect(repos.audit.record).toHaveBeenCalledTimes(1);
  });

  it("lock aborts when a non-absent percentage hits a scale gap", async () => {
    const submitted = { ...draftRegister, status: "SUBMITTED" as const };
    const gapMark = { ...markRow, theoryObtained: 40, practicalObtained: 0 }; // 40% → no band in gapped scale
    const { ctx } = makeCtx(
      admin,
      makeRepos({
        examSections: {
          findById: vi.fn(async () => submitted),
          transition: vi.fn(async () => submitted),
        },
        marks: { listByExamSection: vi.fn(async () => [gapMark]), writeSnapshot: vi.fn() },
        gradeScales: {
          findByIdWithBands: vi.fn(async () => ({
            ...scale,
            bands: [
              {
                id: "x",
                gradeScaleId: "gs-1",
                grade: "X",
                minPercent: 0,
                maxPercent: 30,
                gradePoint: 1,
                ...stamps,
              },
            ],
          })),
        },
      }),
    );
    await expect(lockRegister(ctx, "es-1")).rejects.toBeInstanceOf(ValidationError);
  });

  it("lock snapshots an ABSENT mark as null (exempt from the no-band rule)", async () => {
    const submitted = { ...draftRegister, status: "SUBMITTED" as const };
    const absent = { ...markRow, isAbsent: true, theoryObtained: null, practicalObtained: null };
    const repos = makeRepos({
      examSections: {
        findById: vi.fn(async () => submitted),
        transition: vi.fn(async (_i: string, _f: string, d: Partial<ExamSection>) => ({
          ...submitted,
          ...d,
        })),
      },
      marks: {
        listByExamSection: vi.fn(async () => [absent]),
        writeSnapshot: vi.fn(async (id: string, s: Partial<Mark>) => ({ ...absent, id, ...s })),
      },
    });
    const { ctx } = makeCtx(admin, repos);
    await lockRegister(ctx, "es-1");
    expect(repos.marks.writeSnapshot).toHaveBeenCalledWith(
      "mk-1",
      expect.objectContaining({ percentage: null, gradeBandId: null }),
    );
  });

  it("lock rejects an incomplete register (non-absent mark left blank)", async () => {
    const submitted = { ...draftRegister, status: "SUBMITTED" as const };
    const blank = { ...markRow, isAbsent: false, theoryObtained: null, practicalObtained: null };
    const { ctx } = makeCtx(
      admin,
      makeRepos({
        examSections: {
          findById: vi.fn(async () => submitted),
          transition: vi.fn(async () => submitted),
        },
        marks: { listByExamSection: vi.fn(async () => [blank]), writeSnapshot: vi.fn() },
      }),
    );
    await expect(lockRegister(ctx, "es-1")).rejects.toBeInstanceOf(ValidationError);
  });

  it("double-lock → Conflict (guarded transition)", async () => {
    const submitted = { ...draftRegister, status: "SUBMITTED" as const };
    const { ctx } = makeCtx(
      admin,
      makeRepos({
        examSections: {
          findById: vi.fn(async () => submitted),
          transition: vi.fn(async (): Promise<ExamSection | null> => null),
        },
      }),
    );
    await expect(lockRegister(ctx, "es-1")).rejects.toBeInstanceOf(ConflictError);
  });

  it("unlock requires a reason", async () => {
    const locked = { ...draftRegister, status: "LOCKED" as const };
    const { ctx } = makeCtx(
      admin,
      makeRepos({
        examSections: {
          findById: vi.fn(async () => locked),
          transition: vi.fn(async (_i: string, _f: string, d: Partial<ExamSection>) => ({
            ...locked,
            ...d,
          })),
        },
      }),
    );
    await expect(
      unlockRegister(ctx, { examSectionId: "es-1", reason: "  " }),
    ).rejects.toBeInstanceOf(ValidationError);
    const dto = await unlockRegister(ctx, { examSectionId: "es-1", reason: "fix typo" });
    expect(dto.status).toBe("DRAFT");
  });
});

describe("reads — parent visibility + GPA", () => {
  it("parent sees ONLY published+locked marks for own child", async () => {
    const repos = makeRepos();
    const { ctx } = makeCtx(parent, repos);
    await marksForEnrollment(ctx, "e-1");
    expect(repos.marks.listPublishedByEnrollment).toHaveBeenCalledWith("e-1");
    expect(repos.marks.listByEnrollment).not.toHaveBeenCalled();
  });

  it("staff GPA aggregates snapshot points", async () => {
    const { ctx } = makeCtx(admin);
    const gpa = await gpaForEnrollment(ctx, "e-1");
    expect(gpa).toBeNull(); // markRow snapshot point is null (unlocked) → not available
  });
});
