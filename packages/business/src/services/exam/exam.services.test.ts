import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@repo/core";
import type {
  Assessment,
  Exam,
  ExamSection,
  GradeScaleWithBands,
  Repositories,
  Staff,
} from "@repo/db";
import { createNotificationService } from "@repo/notifications";
import { describe, expect, it, vi } from "vitest";

import type { Principal } from "../../authorization";
import type { ServiceContext } from "../../context";

import { createAssessment, listAssessments } from "./assessment.service";
import {
  createExam,
  getExam,
  listExamRegisters,
  listExams,
  publishExam,
  updateExam,
} from "./exam.service";
import { resolveBandsForExam } from "./grade.service";
import { createGradeScale, listGradeScales } from "./gradeScale.service";

/**
 * Business coverage for the exam/assessment/grade-scale/grade services (M5 Step 9,
 * ADR-012) — the CRUD + publish workflows, the R3 register-oversight enumeration
 * (Step 8), and the friendly-precheck validation edges. Mark entry, the register
 * lifecycle, concurrency, and RLS are covered elsewhere (mark.service.test,
 * mark.concurrency.test, deletion.service.test, exam_rls migration proof).
 */

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

const stamps = { createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01") };
const staffRow = { id: "sf-1", schoolId: "s-1", userId: "u-admin" } as unknown as Staff;
const year = { id: "y-1", schoolId: "s-1", name: "2026", status: "ACTIVE" };
const subject = { id: "sub-1", schoolId: "s-1", name: "Math" };
const subject2 = { id: "sub-2", schoolId: "s-1", name: "Science" };
const section = { id: "sec-1", classId: "c-1", name: "A" };
const section2 = { id: "sec-2", classId: "c-1", name: "B" };
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
const assessment2 = { ...assessment, id: "as-2", subjectId: "sub-2" } as Assessment;
const register1 = {
  id: "es-1",
  schoolId: "s-1",
  assessmentId: "as-1",
  sectionId: "sec-1",
  status: "LOCKED",
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
const register2 = {
  ...register1,
  id: "es-2",
  assessmentId: "as-2",
  sectionId: "sec-2",
  status: "DRAFT",
} as ExamSection;
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
      minPercent: 35,
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
    academicYears: { findById: vi.fn(async () => year) },
    subjects: { findById: vi.fn(async (id: string) => (id === "sub-2" ? subject2 : subject)) },
    sections: { findById: vi.fn(async (id: string) => (id === "sec-2" ? section2 : section)) },
    exams: {
      findById: vi.fn(async (): Promise<Exam | null> => exam),
      create: vi.fn(async (): Promise<Exam> => exam),
      update: vi.fn(async (_id: string, d: Partial<Exam>): Promise<Exam> => ({ ...exam, ...d })),
      publish: vi.fn(async (): Promise<Exam | null> => ({ ...exam, isPublished: true })),
      listByYear: vi.fn(async (): Promise<Exam[]> => [exam]),
    },
    assessments: {
      findById: vi.fn(async (): Promise<Assessment | null> => assessment),
      listByExam: vi.fn(async (): Promise<Assessment[]> => [assessment, assessment2]),
      create: vi.fn(async (): Promise<Assessment> => assessment),
    },
    examSections: {
      listByAssessmentIds: vi.fn(async (): Promise<ExamSection[]> => [register1, register2]),
    },
    gradeScales: {
      findByIdWithBands: vi.fn(async (): Promise<GradeScaleWithBands | null> => scale),
      findDefaultWithBands: vi.fn(async (): Promise<GradeScaleWithBands | null> => scale),
      listBySchool: vi.fn(async (): Promise<GradeScaleWithBands[]> => [scale]),
      create: vi.fn(async (): Promise<GradeScaleWithBands> => scale),
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

const validExam = { academicYearId: "y-1", name: "Half Yearly", type: "HALF_YEARLY" as const };

describe("exam.service — create / update / get / list", () => {
  it("admin creates an exam (audited)", async () => {
    const { ctx, repos } = makeCtx(admin);
    const dto = await createExam(ctx, validExam);
    expect(dto.id).toBe("ex-1");
    expect(repos.exams.create).toHaveBeenCalledTimes(1);
    expect(repos.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "EXAM_CREATE" }),
    );
  });

  it("a teacher cannot create an exam → Forbidden", async () => {
    const { ctx } = makeCtx(teacher);
    await expect(createExam(ctx, validExam)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("create with an out-of-school year → NotFound", async () => {
    const { ctx } = makeCtx(
      admin,
      makeRepos({
        academicYears: { findById: vi.fn(async () => ({ ...year, schoolId: "s-OTHER" })) },
      }),
    );
    await expect(createExam(ctx, validExam)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("editing a PUBLISHED exam → Conflict (definition frozen)", async () => {
    const { ctx } = makeCtx(
      admin,
      makeRepos({ exams: { findById: vi.fn(async () => ({ ...exam, isPublished: true })) } }),
    );
    await expect(updateExam(ctx, "ex-1", { name: "x" })).rejects.toBeInstanceOf(ConflictError);
  });

  it("get / list resolve for admin, cross-school get → NotFound", async () => {
    const { ctx } = makeCtx(admin);
    expect((await getExam(ctx, "ex-1")).id).toBe("ex-1");
    expect(await listExams(ctx, "y-1")).toHaveLength(1);
    const other = makeCtx(
      admin,
      makeRepos({ exams: { findById: vi.fn(async () => ({ ...exam, schoolId: "s-OTHER" })) } }),
    );
    await expect(getExam(other.ctx, "ex-1")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("exam.service — publish (R3 gate)", () => {
  it("admin publishes; guarded + audited exactly once", async () => {
    const { ctx, repos } = makeCtx(admin);
    const dto = await publishExam(ctx, "ex-1");
    expect(dto.isPublished).toBe(true);
    expect(repos.audit.record).toHaveBeenCalledTimes(1);
  });

  it("double-publish → Conflict, NO audit", async () => {
    const { ctx, repos } = makeCtx(
      admin,
      makeRepos({
        exams: {
          findById: vi.fn(async () => exam),
          publish: vi.fn(async (): Promise<Exam | null> => null),
        },
      }),
    );
    await expect(publishExam(ctx, "ex-1")).rejects.toBeInstanceOf(ConflictError);
    expect(repos.audit.record).not.toHaveBeenCalled();
  });

  it("a teacher cannot publish → Forbidden", async () => {
    const { ctx } = makeCtx(teacher);
    await expect(publishExam(ctx, "ex-1")).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("exam.service — listExamRegisters (Step 8 oversight/publish enumeration)", () => {
  it("enumerates every register, name-enriched", async () => {
    const { ctx } = makeCtx(admin);
    const rows = await listExamRegisters(ctx, "ex-1");
    expect(rows).toHaveLength(2);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          examSectionId: "es-1",
          subjectName: "Math",
          sectionName: "A",
          status: "LOCKED",
        }),
        expect.objectContaining({
          examSectionId: "es-2",
          subjectName: "Science",
          sectionName: "B",
          status: "DRAFT",
        }),
      ]),
    );
    // Names must actually resolve — never the "—" fallback on the happy path.
    expect(rows.every((r) => r.subjectName !== "—" && r.sectionName !== "—")).toBe(true);
  });

  it("an exam with no assessments → [] (no crash on empty id list)", async () => {
    const { ctx, repos } = makeCtx(
      admin,
      makeRepos({
        assessments: { listByExam: vi.fn(async (): Promise<Assessment[]> => []) },
        examSections: { listByAssessmentIds: vi.fn(async (): Promise<ExamSection[]> => []) },
      }),
    );
    expect(await listExamRegisters(ctx, "ex-1")).toEqual([]);
    expect(repos.examSections.listByAssessmentIds).toHaveBeenCalledWith([]);
  });

  it("a teacher cannot enumerate registers → Forbidden", async () => {
    const { ctx } = makeCtx(teacher);
    await expect(listExamRegisters(ctx, "ex-1")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("cross-school exam → NotFound", async () => {
    const { ctx } = makeCtx(
      admin,
      makeRepos({ exams: { findById: vi.fn(async () => ({ ...exam, schoolId: "s-OTHER" })) } }),
    );
    await expect(listExamRegisters(ctx, "ex-1")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("assessment.service — create validation edges", () => {
  const validAssessment = {
    examId: "ex-1",
    subjectId: "sub-1",
    maxTheory: 80,
    maxPractical: 20,
    passMark: 30,
  };

  it("admin creates an assessment (audited)", async () => {
    const { ctx, repos } = makeCtx(admin);
    await createAssessment(ctx, validAssessment);
    expect(repos.assessments.create).toHaveBeenCalledTimes(1);
    expect(repos.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ASSESSMENT_CREATE" }),
    );
  });

  it("adding to a PUBLISHED exam → Conflict", async () => {
    const { ctx } = makeCtx(
      admin,
      makeRepos({ exams: { findById: vi.fn(async () => ({ ...exam, isPublished: true })) } }),
    );
    await expect(createAssessment(ctx, validAssessment)).rejects.toBeInstanceOf(ConflictError);
  });

  it("unknown subject → NotFound", async () => {
    const { ctx } = makeCtx(admin, makeRepos({ subjects: { findById: vi.fn(async () => null) } }));
    await expect(createAssessment(ctx, validAssessment)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("passMark above the total maximum → Validation", async () => {
    const { ctx } = makeCtx(admin);
    await expect(
      createAssessment(ctx, { ...validAssessment, maxTheory: 50, maxPractical: 10, passMark: 200 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("lists an exam's assessments", async () => {
    const { ctx } = makeCtx(admin);
    expect(await listAssessments(ctx, "ex-1")).toHaveLength(2);
  });
});

describe("gradeScale.service — validateBands edges", () => {
  const band = (grade: string, min: number, max: number) => ({
    grade,
    minPercent: min,
    maxPercent: max,
  });

  it("admin creates a valid scale (audited)", async () => {
    const { ctx, repos } = makeCtx(admin);
    await createGradeScale(ctx, {
      name: "S",
      isDefault: true,
      bands: [band("E", 0, 35), band("A", 35, 100.01)],
    });
    expect(repos.gradeScales.create).toHaveBeenCalledTimes(1);
    expect(repos.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "GRADE_SCALE_CREATE" }),
    );
  });

  it("no bands → Validation", async () => {
    const { ctx } = makeCtx(admin);
    await expect(
      createGradeScale(ctx, { name: "S", isDefault: false, bands: [] }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("a band with max ≤ min → Validation", async () => {
    const { ctx } = makeCtx(admin);
    await expect(
      createGradeScale(ctx, { name: "S", isDefault: false, bands: [band("A", 50, 50)] }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("overlapping bands → Validation", async () => {
    const { ctx } = makeCtx(admin);
    await expect(
      createGradeScale(ctx, {
        name: "S",
        isDefault: false,
        bands: [band("E", 0, 40), band("A", 35, 100)],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("a teacher cannot create a scale → Forbidden", async () => {
    const { ctx } = makeCtx(teacher);
    await expect(
      createGradeScale(ctx, { name: "S", isDefault: false, bands: [band("A", 0, 100)] }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lists the school's scales", async () => {
    const { ctx } = makeCtx(admin);
    expect(await listGradeScales(ctx)).toHaveLength(1);
  });
});

describe("grade.service — resolveBandsForExam", () => {
  it("resolves the exam's own scale", async () => {
    const { ctx } = makeCtx(admin);
    expect(await resolveBandsForExam(ctx, exam)).toHaveLength(2);
  });

  it("falls back to the school default when the exam has no scale", async () => {
    const { ctx, repos } = makeCtx(admin);
    await resolveBandsForExam(ctx, { ...exam, gradeScaleId: null });
    expect(repos.gradeScales.findDefaultWithBands).toHaveBeenCalledWith("s-1");
  });

  it("no scale resolvable → Validation (cannot lock without a scale)", async () => {
    const { ctx } = makeCtx(
      admin,
      makeRepos({
        gradeScales: {
          findByIdWithBands: vi.fn(async () => null),
          findDefaultWithBands: vi.fn(async () => null),
        },
      }),
    );
    await expect(resolveBandsForExam(ctx, exam)).rejects.toBeInstanceOf(ValidationError);
  });
});
