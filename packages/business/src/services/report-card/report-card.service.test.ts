import { ConflictError, ForbiddenError, ValidationError } from "@repo/core";
import type {
  AcademicTerm,
  AcademicYear,
  ClassTeacherAssignment,
  Enrollment,
  Exam,
  Repositories,
  ReportCard,
  Staff,
} from "@repo/db";
import { createNotificationService } from "@repo/notifications";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Principal } from "../../authorization";
import type { ServiceContext } from "../../context";

import {
  approveReportCard,
  correctReportCard,
  draftClassTeacherRemark,
  generateReportCard,
  listReportCardsForEnrollment,
  publishReportCard,
  reopenReportCard,
  revokeReportCard,
  submitReportCard,
} from "./report-card.service";

/**
 * Service lifecycle suite (M7, ADR-014) — the state machine, its guards, the three
 * mandatory rules (year-consistency, all-or-nothing rank, class-teacher gate), snapshot
 * freeze at approve, and the R3 correction/supersession. Uses a STATEFUL in-memory
 * reportCards store so guarded transitions behave as they do on Postgres (a lost race is
 * a no-op). DB CHECKs/partial-uniques + RLS are proven separately (verify/probes/rls SQL).
 */

/* ---- principals ---- */
const admin: Principal = {
  userId: "u-office",
  schoolId: "s-1",
  role: "OFFICE_ADMIN",
  status: "ACTIVE",
};
const classTeacher: Principal = {
  userId: "u-ct",
  schoolId: "s-1",
  role: "TEACHER",
  status: "ACTIVE",
};
const subjectTeacher: Principal = {
  userId: "u-subj",
  schoolId: "s-1",
  role: "TEACHER",
  status: "ACTIVE",
};
const parent: Principal = { userId: "u-parent", schoolId: "s-1", role: "PARENT", status: "ACTIVE" };

/* ---- rows ---- */
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const stamps = { createdAt: d("2026-01-01"), updatedAt: d("2026-01-01") };

const enrollment: Enrollment = {
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
const year: AcademicYear = {
  id: "y-1",
  schoolId: "s-1",
  name: "2026-27",
  startDate: d("2026-06-01"),
  endDate: d("2027-03-31"),
  status: "ACTIVE",
  ...stamps,
};
const term: AcademicTerm = {
  id: "term-1",
  academicYearId: "y-1",
  name: "Term 1",
  startDate: d("2026-06-01"),
  endDate: d("2026-09-30"),
  ...stamps,
};
const examSameYear: Exam = {
  id: "exam-1",
  schoolId: "s-1",
  academicYearId: "y-1",
  gradeScaleId: null,
  name: "Mid Term",
  type: "MID_TERM",
  displayOrder: 0,
  startDate: null,
  endDate: null,
  isPublished: false,
  publishedAt: null,
  publishedByStaffId: null,
  ...stamps,
};
const examOtherYear: Exam = { ...examSameYear, id: "exam-2", academicYearId: "y-OTHER" };
const staffRow: Staff = {
  id: "stf-1",
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
const cta: ClassTeacherAssignment = {
  id: "cta-1",
  schoolId: "s-1",
  academicYearId: "y-1",
  sectionId: "sec-5a",
  teacherId: "u-ct",
  assignedAt: d("2026-06-05"),
  createdByStaffId: "stf-1",
  ...stamps,
};

const CARD_DEFAULTS: Omit<ReportCard, "id" | "enrollmentId" | "kind" | "version"> = {
  schoolId: "s-1",
  examId: null,
  termId: null,
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
  createdByStaffId: "stf-1",
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

/** Stateful reportCards repo — guarded transitions behave as on Postgres. */
function makeStore(seed: Partial<ReportCard>[] = []) {
  let n = 0;
  const rows: ReportCard[] = seed.map((s) => ({
    ...CARD_DEFAULTS,
    id: `rc-${++n}`,
    enrollmentId: "e-1",
    kind: "ANNUAL",
    version: 1,
    ...s,
  }));
  const inScope = (r: ReportCard, e: string, k: string, ex: string | null, tm: string | null) =>
    r.enrollmentId === e && r.kind === k && r.examId === ex && r.termId === tm;
  return {
    rows,
    findById: vi.fn(async (id: string) => rows.find((r) => r.id === id) ?? null),
    listByEnrollment: vi.fn(async (e: string) => rows.filter((r) => r.enrollmentId === e)),
    listPublishedByEnrollment: vi.fn(async (e: string) =>
      rows.filter((r) => r.enrollmentId === e && r.status === "PUBLISHED"),
    ),
    findScopeVersions: vi.fn(async (e: string, k: string, ex: string | null, tm: string | null) =>
      rows.filter((r) => inScope(r, e, k, ex, tm)).sort((a, b) => b.version - a.version),
    ),
    create: vi.fn(
      async (input: Partial<ReportCard> & { version: number; kind: ReportCard["kind"] }) => {
        const row: ReportCard = {
          ...CARD_DEFAULTS,
          id: `rc-${++n}`,
          enrollmentId: input.enrollmentId ?? "e-1",
          kind: input.kind,
          version: input.version,
          examId: input.examId ?? null,
          termId: input.termId ?? null,
          classTeacherRemark: input.classTeacherRemark ?? null,
          principalRemark: input.principalRemark ?? null,
          promotionDecision: input.promotionDecision ?? null,
          createdByStaffId: input.createdByStaffId ?? "stf-1",
        };
        rows.push(row);
        return row;
      },
    ),
    updateContent: vi.fn(
      async (id: string, fromStatuses: readonly string[], data: Partial<ReportCard>) => {
        const r = rows.find((x) => x.id === id);
        if (!r || !fromStatuses.includes(r.status)) return null;
        Object.assign(r, data);
        return r;
      },
    ),
    transition: vi.fn(async (id: string, fromStatus: string, data: Partial<ReportCard>) => {
      const r = rows.find((x) => x.id === id);
      if (!r || r.status !== fromStatus) return null;
      Object.assign(r, data);
      return r;
    }),
  };
}

/** marks/attendance for the snapshot: `withMarks=false` → GPA null → rank null. */
function makeCtx(
  user: Principal,
  store = makeStore(),
  opts: { withMarks?: boolean } = { withMarks: true },
) {
  const marks = opts.withMarks ? [{ gradePointSnapshot: 8 }] : [];
  const repos = {
    audit: { record: vi.fn(async () => undefined) },
    staff: {
      findByUserId: vi.fn(async () => staffRow),
      findById: vi.fn(async () => staffRow),
    },
    enrollments: {
      findById: vi.fn(async () => enrollment),
      listBySection: vi.fn(async () => [enrollment]),
    },
    exams: {
      findById: vi.fn(async (id: string) =>
        id === "exam-1" ? examSameYear : id === "exam-2" ? examOtherYear : null,
      ),
    },
    academicTerms: { findById: vi.fn(async () => term) },
    academicYears: { findById: vi.fn(async () => year) },
    classTeacherAssignments: { findBySectionYear: vi.fn(async () => cta) },
    parents: { findByUserId: vi.fn(async () => ({ id: "par-1", schoolId: "s-1" })) },
    studentParents: { studentIdsForParent: vi.fn(async () => ["st-1"]) },
    marks: {
      listByEnrollment: vi.fn(async () => marks),
      listPublishedByEnrollment: vi.fn(async () => marks),
    },
    attendanceRecords: {
      listByEnrollmentInRange: vi.fn(async () => [{ status: "PRESENT" }, { status: "ABSENT" }]),
    },
    reportCards: store,
  };
  const repositories = repos as unknown as Repositories;
  const ctx: ServiceContext = {
    user,
    repositories,
    notifications: createNotificationService([]),
    withTransaction: <T>(fn: (r: Repositories) => Promise<T>) => fn(repositories),
  };
  return { ctx, store, repos };
}

const annual = { enrollmentId: "e-1", kind: "ANNUAL" as const };

/* ================================ generate ================================ */
describe("generate", () => {
  it("creates a DRAFT v1", async () => {
    const { ctx } = makeCtx(admin);
    const c = await generateReportCard(ctx, annual);
    expect(c.status).toBe("DRAFT");
    expect(c.version).toBe(1);
  });
  it("is idempotent — returns the existing DRAFT", async () => {
    const { ctx, store } = makeCtx(admin);
    const first = await generateReportCard(ctx, annual);
    const second = await generateReportCard(ctx, annual);
    expect(second.id).toBe(first.id);
    expect(store.rows).toHaveLength(1);
  });
  it("refuses when a live (published) card already occupies the scope", async () => {
    const { ctx } = makeCtx(admin, makeStore([{ status: "PUBLISHED", version: 1 }]));
    await expect(generateReportCard(ctx, annual)).rejects.toBeInstanceOf(ConflictError);
  });
  it("rejects an EXAM card whose exam year ≠ the enrollment's year (year consistency)", async () => {
    const { ctx } = makeCtx(admin);
    await expect(
      generateReportCard(ctx, { enrollmentId: "e-1", kind: "EXAM", examId: "exam-2" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
  it("accepts an EXAM card whose exam year matches", async () => {
    const { ctx } = makeCtx(admin);
    const c = await generateReportCard(ctx, {
      enrollmentId: "e-1",
      kind: "EXAM",
      examId: "exam-1",
    });
    expect(c.examId).toBe("exam-1");
  });
  it("is admin-only (a class teacher cannot generate)", async () => {
    const { ctx } = makeCtx(classTeacher);
    await expect(generateReportCard(ctx, annual)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

/* ============================ remark + submit ============================= */
describe("class-teacher remark + submit (gate)", () => {
  it("the class teacher may draft a remark while DRAFT", async () => {
    const { ctx } = makeCtx(classTeacher, makeStore([{ status: "DRAFT" }]));
    const c = await draftClassTeacherRemark(ctx, { reportCardId: "rc-1", remark: "Good progress" });
    expect(c.classTeacherRemark).toBe("Good progress");
  });
  it("a subject teacher of the same section is refused (the discriminating gate)", async () => {
    const { ctx } = makeCtx(subjectTeacher, makeStore([{ status: "DRAFT" }]));
    await expect(
      draftClassTeacherRemark(ctx, { reportCardId: "rc-1", remark: "x" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("a remark cannot be edited once past DRAFT", async () => {
    const { ctx } = makeCtx(classTeacher, makeStore([{ status: "SUBMITTED" }]));
    await expect(
      draftClassTeacherRemark(ctx, { reportCardId: "rc-1", remark: "x" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
  it("submit moves DRAFT → SUBMITTED and stamps the actor", async () => {
    const { ctx } = makeCtx(classTeacher, makeStore([{ status: "DRAFT" }]));
    const c = await submitReportCard(ctx, "rc-1");
    expect(c.status).toBe("SUBMITTED");
    expect(c.submittedByStaffId).toBe("stf-1");
  });
  it("submit is refused for a subject teacher", async () => {
    const { ctx } = makeCtx(subjectTeacher, makeStore([{ status: "DRAFT" }]));
    await expect(submitReportCard(ctx, "rc-1")).rejects.toBeInstanceOf(ForbiddenError);
  });
});

/* ================================ approve ================================= */
describe("approve — snapshot freeze + guards", () => {
  it("SUBMITTED → APPROVED freezes rank/GPA/attendance", async () => {
    const { ctx, store } = makeCtx(admin, makeStore([{ status: "SUBMITTED" }]));
    const c = await approveReportCard(ctx, "rc-1");
    expect(c.status).toBe("APPROVED");
    expect(c.approvedAt).not.toBeNull();
    expect(c.gpaSnapshot).toBe(8);
    expect(c.rank).toBe(1);
    expect(c.rankScope).toBe("SECTION");
    expect(c.cohortSize).toBe(1);
    expect(c.attendancePercentage).toBe(50); // PRESENT + ABSENT → 1/2
    expect(store.rows[0]!.status).toBe("APPROVED");
  });
  it("stores null rank/rankScope/cohortSize when GPA is unavailable (all-or-nothing)", async () => {
    const { ctx } = makeCtx(admin, makeStore([{ status: "SUBMITTED" }]), { withMarks: false });
    const c = await approveReportCard(ctx, "rc-1");
    expect(c.gpaSnapshot).toBeNull();
    expect(c.rank).toBeNull();
    expect(c.rankScope).toBeNull();
    expect(c.cohortSize).toBeNull();
  });
  it("rejects approving a DRAFT (skip-state)", async () => {
    const { ctx } = makeCtx(admin, makeStore([{ status: "DRAFT" }]));
    await expect(approveReportCard(ctx, "rc-1")).rejects.toBeInstanceOf(ConflictError);
  });
  it("a second concurrent approve loses (guarded — Conflict)", async () => {
    const { ctx } = makeCtx(admin, makeStore([{ status: "SUBMITTED" }]));
    await approveReportCard(ctx, "rc-1");
    await expect(approveReportCard(ctx, "rc-1")).rejects.toBeInstanceOf(ConflictError);
  });
});

/* ========================= reopen / publish / revoke ====================== */
describe("reopen / publish / revoke", () => {
  it("reopen (APPROVED → DRAFT) clears the snapshot and stamps", async () => {
    const { ctx } = makeCtx(
      admin,
      makeStore([{ status: "APPROVED", approvedAt: d("2026-10-01"), rank: 1, gpaSnapshot: 8 }]),
    );
    const c = await reopenReportCard(ctx, { reportCardId: "rc-1", reason: "fix marks" });
    expect(c.status).toBe("DRAFT");
    expect(c.approvedAt).toBeNull();
    expect(c.rank).toBeNull();
    expect(c.gpaSnapshot).toBeNull();
    expect(c.reopenReason).toBe("fix marks");
  });
  it("reopen requires a reason", async () => {
    const { ctx } = makeCtx(
      admin,
      makeStore([{ status: "APPROVED", approvedAt: d("2026-10-01") }]),
    );
    await expect(
      reopenReportCard(ctx, { reportCardId: "rc-1", reason: "  " }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
  it("publish (APPROVED → PUBLISHED) stamps the publisher", async () => {
    const { ctx } = makeCtx(
      admin,
      makeStore([{ status: "APPROVED", approvedAt: d("2026-10-01") }]),
    );
    const c = await publishReportCard(ctx, "rc-1");
    expect(c.status).toBe("PUBLISHED");
    expect(c.publishedByStaffId).toBe("stf-1");
  });
  it("publish is refused unless APPROVED", async () => {
    const { ctx } = makeCtx(admin, makeStore([{ status: "SUBMITTED" }]));
    await expect(publishReportCard(ctx, "rc-1")).rejects.toBeInstanceOf(ConflictError);
  });
  it("publish is admin-only (a class teacher cannot publish — report_card:manage)", async () => {
    const { ctx } = makeCtx(
      classTeacher,
      makeStore([{ status: "APPROVED", approvedAt: d("2026-10-01") }]),
    );
    await expect(publishReportCard(ctx, "rc-1")).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("revoke (PUBLISHED → REVOKED) requires a reason", async () => {
    const { ctx } = makeCtx(
      admin,
      makeStore([
        { status: "PUBLISHED", approvedAt: d("2026-10-01"), publishedAt: d("2026-10-02") },
      ]),
    );
    await expect(
      revokeReportCard(ctx, { reportCardId: "rc-1", reason: "" }),
    ).rejects.toBeInstanceOf(ValidationError);
    const c = await revokeReportCard(ctx, { reportCardId: "rc-1", reason: "issued in error" });
    expect(c.status).toBe("REVOKED");
  });
});

/* ============================ correction (R3) ============================= */
describe("correction — versioning + supersession", () => {
  it("correct spawns a new DRAFT v2 copying the authored fields", async () => {
    const { ctx } = makeCtx(
      admin,
      makeStore([
        {
          status: "PUBLISHED",
          version: 1,
          approvedAt: d("2026-10-01"),
          publishedAt: d("2026-10-02"),
          classTeacherRemark: "keep me",
          promotionDecision: "PROMOTED",
        },
      ]),
    );
    const v2 = await correctReportCard(ctx, "rc-1");
    expect(v2.status).toBe("DRAFT");
    expect(v2.version).toBe(2);
    expect(v2.classTeacherRemark).toBe("keep me");
    expect(v2.promotionDecision).toBe("PROMOTED");
  });
  it("correct refuses while a correction is already in progress", async () => {
    const { ctx } = makeCtx(
      admin,
      makeStore([
        {
          status: "PUBLISHED",
          version: 1,
          approvedAt: d("2026-10-01"),
          publishedAt: d("2026-10-02"),
        },
        { status: "DRAFT", version: 2 },
      ]),
    );
    await expect(correctReportCard(ctx, "rc-1")).rejects.toBeInstanceOf(ConflictError);
  });
  it("publishing the correction supersedes the prior published version (one live)", async () => {
    const { ctx, store } = makeCtx(
      admin,
      makeStore([
        {
          status: "PUBLISHED",
          version: 1,
          approvedAt: d("2026-10-01"),
          publishedAt: d("2026-10-02"),
        },
        { status: "APPROVED", version: 2, approvedAt: d("2026-10-03") },
      ]),
    );
    await publishReportCard(ctx, "rc-2");
    expect(store.rows.find((r) => r.version === 1)!.status).toBe("SUPERSEDED");
    expect(store.rows.find((r) => r.version === 2)!.status).toBe("PUBLISHED");
    expect(store.rows.filter((r) => r.status === "PUBLISHED")).toHaveLength(1);
  });
});

/* ================================= reads ================================== */
describe("reads", () => {
  let store: ReturnType<typeof makeStore>;
  beforeEach(() => {
    store = makeStore([
      { status: "DRAFT", version: 2 },
      {
        status: "PUBLISHED",
        version: 1,
        approvedAt: d("2026-10-01"),
        publishedAt: d("2026-10-02"),
      },
    ]);
  });
  it("a parent sees only PUBLISHED cards for their child's enrollment", async () => {
    const { ctx } = makeCtx(parent, store);
    const cards = await listReportCardsForEnrollment(ctx, "e-1");
    expect(cards.map((c) => c.status)).toEqual(["PUBLISHED"]);
  });
  it("an admin sees every version", async () => {
    const { ctx } = makeCtx(admin, store);
    const cards = await listReportCardsForEnrollment(ctx, "e-1");
    expect(cards).toHaveLength(2);
  });
  it("ANNUAL cards carry null exam/term names (no scope) — enrichment is all-or-nothing", async () => {
    const { ctx } = makeCtx(admin, store);
    const [card] = await listReportCardsForEnrollment(ctx, "e-1");
    expect(card!.examName).toBeNull();
    expect(card!.termName).toBeNull();
  });
  it("a TERM card is enriched with termName + the remark author (classTeacherName)", async () => {
    const { ctx } = makeCtx(
      admin,
      makeStore([
        {
          status: "PUBLISHED",
          version: 1,
          kind: "TERM",
          termId: "term-1",
          submittedByStaffId: "stf-1",
          approvedAt: d("2026-10-01"),
          publishedAt: d("2026-10-02"),
        },
      ]),
    );
    const [card] = await listReportCardsForEnrollment(ctx, "e-1");
    expect(card!.termName).toBe("Term 1");
    expect(card!.examName).toBeNull();
    expect(card!.classTeacherName).toBe("Olivia Office");
  });
});
