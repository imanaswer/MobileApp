import { ConflictError } from "@repo/core";
import type { Repositories } from "@repo/db";
import { createNotificationService } from "@repo/notifications";
import { describe, expect, it, vi } from "vitest";

import type { Principal } from "../../authorization";
import type { ServiceContext } from "../../context";

import { markAttendance, openSession, submitSession } from "./attendance.service";
import { decideCorrection } from "./correction.service";

/**
 * REAL concurrency: each operation is raced with Promise.all against a STATEFUL
 * in-memory repo that enforces the same invariants the database does —
 * natural-key uniqueness on session create, idempotent upsert on records, and
 * atomic guarded transitions (check-and-set with no interleaving await) for
 * session status + correction decisions. Because the async mocks yield at every
 * await, the two operations genuinely interleave, so these exercise the
 * check-then-act races, not a happy path.
 */

const officeAdmin: Principal = { userId: "u-office", schoolId: "s-1", role: "OFFICE_ADMIN", status: "ACTIVE" };
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const stamps = { createdAt: d("2026-01-01"), updatedAt: d("2026-01-01") };
const DATE = d("2026-08-01");

const staffRow = { id: "sf-1", schoolId: "s-1", userId: "u-office" };
const enrollmentRow = { id: "e-1", schoolId: "s-1", studentId: "st-1", sectionId: "sec-1", status: "ACTIVE" };
const assignmentRow = { id: "a-1", schoolId: "s-1", teacherId: "u-office", subjectId: "sub-1", sectionId: "sec-1" };

/** A stateful repository aggregate that enforces DB-like invariants atomically. */
function makeStatefulRepos() {
  let seq = 0;
  const sessions = new Map<string, Record<string, unknown>>();
  const naturalKeys = new Set<string>();
  const records = new Map<string, Record<string, unknown>>();
  const corrections = new Map<string, Record<string, unknown>>();
  const audit: { action: string }[] = [];
  let updateStatusCalls = 0;
  const recordRef: Record<string, unknown> = {
    id: "rec-1", schoolId: "s-1", sessionId: "ses-seed", enrollmentId: "e-1",
    status: "PRESENT", remarks: null, ...stamps, session: { date: DATE },
  };

  const keyOf = (sectionId: string, date: Date, type: string, subjectId: string | null) =>
    `${sectionId}|${date.toISOString()}|${type}|${String(subjectId)}`;

  const repos = {
    audit: { record: vi.fn(async (row: { action: string }) => { audit.push(row); }) },
    academicYears: { findById: async () => ({ schoolId: "s-1" }), findActive: async () => ({ id: "y-1" }) },
    sections: { findById: async () => ({ id: "sec-1", classId: "c-1" }) },
    subjects: { findById: async () => ({ id: "sub-1", schoolId: "s-1" }) },
    teacherAssignments: { list: async () => [assignmentRow] },
    students: { findById: async () => ({ id: "st-1", firstName: "A", lastName: "B" }) },
    enrollments: { findById: async () => enrollmentRow, listBySection: async () => [enrollmentRow] },
    staff: { findByUserId: async () => staffRow },
    parents: { findByUserId: async () => ({ id: "p-1", schoolId: "s-1" }) },
    studentParents: { studentIdsForParent: async () => ["st-1"] },
    holidays: { findByYearDate: async () => null },
    attendanceSessions: {
      findExisting: async (sectionId: string, date: Date, type: string, subjectId: string | null) => {
        for (const s of sessions.values()) {
          if (s._key === keyOf(sectionId, date, type, subjectId)) return s;
        }
        return null;
      },
      create: async (input: { sectionId: string; date: Date; sessionType: string; subjectId?: string | null }) => {
        const key = keyOf(input.sectionId, input.date, input.sessionType, input.subjectId ?? null);
        // Simulate the DB partial-unique index — the real safety net.
        if (naturalKeys.has(key)) throw new Error("unique violation: AttendanceSession natural key");
        naturalKeys.add(key);
        const id = `ses-${++seq}`;
        const row = { id, ...input, subjectId: input.subjectId ?? null, status: "DRAFT", _key: key, ...stamps };
        sessions.set(id, row);
        return row;
      },
      findById: async (id: string) => sessions.get(id) ?? null,
      // Atomic guarded transition (no await between check and set).
      transition: async (id: string, from: string, data: Record<string, unknown>) => {
        const s = sessions.get(id);
        if (!s || s.status !== from) return null;
        const updated = { ...s, ...data };
        sessions.set(id, updated);
        return updated;
      },
    },
    attendanceRecords: {
      findById: async () => recordRef,
      listBySession: async () => [],
      listByEnrollmentInRange: async () => [],
      upsert: async (input: { sessionId: string; enrollmentId: string; status: string }) => {
        const key = `${input.sessionId}:${input.enrollmentId}`;
        const row = { ...(records.get(key) ?? { id: `rec-${++seq}`, ...stamps, session: { date: DATE } }), ...input };
        records.set(key, row);
        return row;
      },
      updateStatus: async (_id: string, status: string) => {
        updateStatusCalls += 1;
        recordRef.status = status;
        return recordRef;
      },
    },
    attendanceCorrections: {
      findById: async (id: string) => corrections.get(id) ?? null,
      // Atomic guarded decide.
      decide: async (id: string, data: Record<string, unknown>) => {
        const c = corrections.get(id);
        if (!c || c.status !== "PENDING") return null;
        const updated = { ...c, ...data };
        corrections.set(id, updated);
        return updated;
      },
    },
  };

  const ctx: ServiceContext = {
    user: officeAdmin,
    repositories: repos as unknown as Repositories,
    notifications: createNotificationService([]),
    withTransaction: <T>(fn: (r: Repositories) => Promise<T>) => fn(repos as unknown as Repositories),
  };

  return {
    ctx,
    stores: { sessions, records, corrections, audit, get updateStatusCalls() { return updateStatusCalls; } },
    seedSession: () => {
      sessions.set("ses-seed", {
        id: "ses-seed", schoolId: "s-1", sectionId: "sec-1", academicYearId: "y-1",
        subjectId: null, sessionType: "DAILY", date: DATE, status: "DRAFT",
        createdByStaffId: "sf-1", submittedByStaffId: null, lockedByStaffId: null,
        submittedAt: null, lockedAt: null, ...stamps,
      });
    },
    seedCorrection: () => {
      corrections.set("cor-1", {
        id: "cor-1", schoolId: "s-1", attendanceRecordId: "rec-1", requestedByStaffId: "sf-1",
        previousStatus: "PRESENT", requestedStatus: "ABSENT", reason: "x", status: "PENDING",
        decidedByStaffId: null, decidedAt: null, ...stamps,
      });
    },
  };
}

const openInput = { academicYearId: "y-1", sectionId: "sec-1", sessionType: "DAILY" as const, date: DATE };

describe("attendance — real concurrency (Promise.all races)", () => {
  it("concurrent openSession → exactly ONE session, ONE audit row", async () => {
    const { ctx, stores } = makeStatefulRepos();
    const results = await Promise.allSettled([openSession(ctx, openInput), openSession(ctx, openInput)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(stores.sessions.size).toBe(1);
    expect(stores.audit).toHaveLength(1);
  });

  it("concurrent markAttendance (same enrollment) → ONE record per enrollment, consistent final state", async () => {
    const { ctx, stores, seedSession } = makeStatefulRepos();
    seedSession();
    const results = await Promise.allSettled([
      markAttendance(ctx, { sessionId: "ses-seed", marks: [{ enrollmentId: "e-1", status: "PRESENT" }] }),
      markAttendance(ctx, { sessionId: "ses-seed", marks: [{ enrollmentId: "e-1", status: "ABSENT" }] }),
    ]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true); // upsert is idempotent
    expect(stores.records.size).toBe(1); // one row for the enrollment, not two
    expect(["PRESENT", "ABSENT"]).toContain(stores.records.get("ses-seed:e-1")?.status);
  });

  it("concurrent submit → ONE transition wins, ONE audit, final SUBMITTED", async () => {
    const { ctx, stores, seedSession } = makeStatefulRepos();
    seedSession();
    const results = await Promise.allSettled([submitSession(ctx, "ses-seed"), submitSession(ctx, "ses-seed")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected");
    expect((rejected as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);
    expect(stores.sessions.get("ses-seed")?.status).toBe("SUBMITTED");
    expect(stores.audit).toHaveLength(1);
  });

  it("concurrent correction approval → record changes ONCE, ONE audit, one Conflict", async () => {
    const { ctx, stores, seedCorrection } = makeStatefulRepos();
    seedCorrection();
    const results = await Promise.allSettled([
      decideCorrection(ctx, { correctionId: "cor-1", decision: "APPROVED" }),
      decideCorrection(ctx, { correctionId: "cor-1", decision: "APPROVED" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected");
    expect((rejected as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);
    expect(stores.corrections.get("cor-1")?.status).toBe("APPROVED");
    expect(stores.updateStatusCalls).toBe(1); // the record was updated exactly once
    expect(stores.audit).toHaveLength(1);
  });
});
