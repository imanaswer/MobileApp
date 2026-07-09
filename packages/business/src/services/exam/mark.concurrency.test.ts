import type { Repositories } from "@repo/db";
import { createNotificationService } from "@repo/notifications";
import { describe, expect, it, vi } from "vitest";

import type { Principal } from "../../authorization";
import type { ServiceContext } from "../../context";

import { saveMarks } from "./mark.service";

/**
 * REAL concurrency for register creation (matching the M4 attendance standard).
 * Two first-time saveMarks() for the SAME (assessment, section) are raced with
 * Promise.all against a STATEFUL repo whose `ensure` models the DB's atomic
 * INSERT … ON CONFLICT: the check-and-set has no interleaving await, so the first
 * caller creates and the second gets that same row. The async mocks yield at every
 * other await, so the two calls genuinely interleave — this exercises the
 * check-then-create race, not a happy path. If saveMarks called `create` instead
 * of `ensure`, the stateful `create` throws (a duplicate), failing the test.
 */

const teacher: Principal = {
  userId: "u-teacher",
  schoolId: "s-1",
  role: "TEACHER",
  status: "ACTIVE",
};
const stamps = { createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01") };

const assessment = {
  id: "as-1",
  schoolId: "s-1",
  examId: "ex-1",
  subjectId: "sub-1",
  maxTheory: 100,
  maxPractical: null,
  passMark: 35,
  displayOrder: 0,
  ...stamps,
};
const exam = { id: "ex-1", schoolId: "s-1", academicYearId: "y-1", isPublished: false };

function makeStatefulRepos() {
  const registers = new Map<string, Record<string, unknown>>();
  const marks = new Map<string, Record<string, unknown>>();
  const audit: { action: string }[] = [];
  let registerCreateCount = 0;
  const key = (a: string, s: string) => `${a}|${s}`;

  const repos = {
    audit: {
      record: vi.fn(async (row: { action: string }) => {
        audit.push(row);
      }),
    },
    staff: {
      findByUserId: async () => ({ id: "sf-teacher", schoolId: "s-1", userId: "u-teacher" }),
    },
    teacherAssignments: {
      findByTriple: async (t: string, sub: string, sec: string) =>
        t === "u-teacher" && sub === "sub-1" && sec === "sec-1" ? { id: "ta-1" } : null,
    },
    assessments: { findById: async () => assessment },
    exams: { findById: async () => exam },
    sections: { findById: async () => ({ id: "sec-1", classId: "c-1" }) },
    enrollments: {
      findById: async (id: string) => {
        await Promise.resolve(); // yield → interleave the two calls
        return {
          id,
          schoolId: "s-1",
          studentId: `st-${id}`,
          academicYearId: "y-1",
          sectionId: "sec-1",
          status: "ACTIVE",
        };
      },
    },
    examSections: {
      findByAssessmentSection: async (a: string, s: string) => {
        await Promise.resolve();
        return registers.get(key(a, s)) ?? null;
      },
      // Atomic get-or-create — models INSERT ON CONFLICT DO NOTHING. The check+set
      // below run with NO await between them, so concurrent callers can't both create.
      ensure: async (input: {
        assessmentId: string;
        sectionId: string;
        createdByStaffId: string;
      }) => {
        await Promise.resolve();
        const k = key(input.assessmentId, input.sectionId);
        const found = registers.get(k);
        if (found) return found;
        registerCreateCount += 1;
        const row = {
          id: `es-${registerCreateCount}`,
          schoolId: "s-1",
          assessmentId: input.assessmentId,
          sectionId: input.sectionId,
          status: "DRAFT",
          createdByStaffId: input.createdByStaffId,
          submittedByStaffId: null,
          lockedByStaffId: null,
          submittedAt: null,
          lockedAt: null,
          unlockedByStaffId: null,
          unlockedAt: null,
          unlockReason: null,
          ...stamps,
        };
        registers.set(k, row);
        return row;
      },
      // Guard: saveMarks must NOT use create for the register (would race).
      create: async () => {
        throw new Error("duplicate register (create raced)");
      },
    },
    marks: {
      upsert: async (input: {
        assessmentId: string;
        enrollmentId: string;
        examSectionId: string;
        isAbsent: boolean;
      }) => {
        await Promise.resolve();
        const k = `${input.assessmentId}|${input.enrollmentId}`;
        const row = {
          id: `mk-${k}`,
          schoolId: "s-1",
          ...input,
          theoryObtained: 70,
          practicalObtained: null,
          totalObtained: null,
          percentage: null,
          gradeBandId: null,
          gradeLetterSnapshot: null,
          gradePointSnapshot: null,
          enteredByStaffId: "sf-teacher",
          ...stamps,
        };
        marks.set(k, row);
        return row;
      },
    },
  };

  const withTransaction = <T>(fn: (r: Repositories) => Promise<T>) =>
    fn(repos as unknown as Repositories);
  const ctx: ServiceContext = {
    user: teacher,
    repositories: repos as unknown as Repositories,
    notifications: createNotificationService([]),
    withTransaction,
  };
  return { ctx, registers, marks, audit, count: () => registerCreateCount };
}

describe("saveMarks — concurrent register creation", () => {
  it("two concurrent first-saves create exactly ONE register; both succeed", async () => {
    const st = makeStatefulRepos();
    const save = (enrollmentId: string) =>
      saveMarks(st.ctx, {
        assessmentId: "as-1",
        sectionId: "sec-1",
        marks: [{ enrollmentId, theoryObtained: 70 }],
      });

    const [a, b] = await Promise.all([save("e-1"), save("e-2")]);

    // both callers complete successfully
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    // exactly one register created / exists, and both callers used the same one
    expect(st.count()).toBe(1);
    expect(st.registers.size).toBe(1);
    expect(a[0]!.examSectionId).toBe(b[0]!.examSectionId);
    // no partial mark writes — both students' marks persisted
    expect(st.marks.size).toBe(2);
    // one MARK_SAVE audit per save call — no spurious register-creation audit
    expect(st.audit).toHaveLength(2);
    expect(st.audit.every((r) => r.action === "MARK_SAVE")).toBe(true);
  });

  it("concurrent identical saves (offline double-submit) are idempotent — one register, one mark", async () => {
    const st = makeStatefulRepos();
    const save = () =>
      saveMarks(st.ctx, {
        assessmentId: "as-1",
        sectionId: "sec-1",
        marks: [{ enrollmentId: "e-1", theoryObtained: 70 }],
      });

    await Promise.all([save(), save()]);

    expect(st.count()).toBe(1);
    expect(st.registers.size).toBe(1);
    expect(st.marks.size).toBe(1); // same (assessment, enrollment) → one row (upsert)
  });
});
