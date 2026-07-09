import { PERMISSIONS } from "@repo/constants";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@repo/core";
import type {
  AttendanceRecordDto,
  AttendanceRosterRowDto,
  AttendanceSessionDto,
  AttendanceStatusKey,
  AttendanceSummaryDto,
} from "@repo/types";

import { assertCan } from "../../authorization";
import type { ServiceContext } from "../../context";

import { mapAttendanceRecord, mapAttendanceSession } from "./mappers";
import {
  assertEnrollmentInScope,
  assertTeachesSection,
  assertWorkingDay,
  loadEnrollmentInSchool,
  loadSessionInSchool,
  recordAudit,
  resolveActingStaffId,
  toIstDateString,
} from "./scope";

export interface OpenSessionInput {
  academicYearId: string;
  sectionId: string;
  sessionType: "DAILY" | "SUBJECT";
  subjectId?: string | undefined;
  date: Date;
}

export interface MarkInput {
  enrollmentId: string;
  status: AttendanceStatusKey;
  remarks?: string | undefined;
}

export interface MarkAttendanceInput {
  sessionId: string;
  marks: MarkInput[];
}

/**
 * Open a register (AttendanceSession) for a section/date/type. Rejected on a
 * holiday (ADR-011 §9), on a duplicate (DB partial-unique pre-checked), or out
 * of the teacher's section scope. Starts in DRAFT.
 */
export async function openSession(
  ctx: ServiceContext,
  input: OpenSessionInput,
): Promise<AttendanceSessionDto> {
  assertCan(ctx.user, PERMISSIONS.ATTENDANCE_MARK);
  const staffId = await resolveActingStaffId(ctx);

  await assertYearInSchool(ctx, input.academicYearId);
  await assertSectionInSchool(ctx, input.sectionId);
  await assertTeachesSection(ctx, input.sectionId);

  if (input.sessionType === "SUBJECT") {
    if (!input.subjectId) {
      throw new ValidationError("A subject session requires a subjectId");
    }
    await assertSubjectInSchool(ctx, input.subjectId);
    // ponytail: teacher scope is section-level for M4 (UI is daily-first). Tighten
    // to exact (subject, section) TeacherAssignment when the subject UI lands.
  } else if (input.subjectId) {
    throw new ValidationError("A daily session must not carry a subject");
  }

  await assertWorkingDay(ctx, input.academicYearId, input.date);

  const subjectId = input.subjectId ?? null;
  if (
    await ctx.repositories.attendanceSessions.findExisting(
      input.sectionId,
      input.date,
      input.sessionType,
      subjectId,
    )
  ) {
    throw new ConflictError("A register for this section, date and type already exists");
  }

  return ctx.withTransaction(async (repos) => {
    const created = await repos.attendanceSessions.create({
      schoolId: ctx.user.schoolId,
      academicYearId: input.academicYearId,
      sectionId: input.sectionId,
      subjectId,
      sessionType: input.sessionType,
      date: input.date,
      createdByStaffId: staffId,
    });
    await recordAudit(ctx, repos, {
      action: "ATTENDANCE_SESSION_OPEN",
      entityType: "AttendanceSession",
      entityId: created.id,
      after: {
        sectionId: created.sectionId,
        date: toIstDateString(input.date),
        sessionType: created.sessionType,
      },
    });
    return mapAttendanceSession(created);
  });
}

/**
 * Find the existing register for a section/date/type (or null) — the marking
 * screen calls this on load to decide between "open register" and showing the
 * roster, without the side effect of creating one. Teacher → own-section only.
 */
export async function findSession(
  ctx: ServiceContext,
  input: {
    sectionId: string;
    sessionType: "DAILY" | "SUBJECT";
    subjectId?: string | undefined;
    date: Date;
  },
): Promise<AttendanceSessionDto | null> {
  assertCan(ctx.user, PERMISSIONS.ATTENDANCE_READ);
  await assertTeachesSection(ctx, input.sectionId);
  const row = await ctx.repositories.attendanceSessions.findExisting(
    input.sectionId,
    input.date,
    input.sessionType,
    input.subjectId ?? null,
  );
  return row ? mapAttendanceSession(row) : null;
}

/**
 * The marking screen's roster: every ACTIVE enrollment in the session's section,
 * its existing mark (if any), and a leave-derived suggested default (ADR-011 §7 —
 * approved leave biases the default to LEAVE; it is never an eager write).
 */
export async function sessionRoster(
  ctx: ServiceContext,
  sessionId: string,
): Promise<AttendanceRosterRowDto[]> {
  assertCan(ctx.user, PERMISSIONS.ATTENDANCE_READ);
  const session = await loadSessionInSchool(ctx, sessionId);
  await assertTeachesSection(ctx, session.sectionId);

  const enrollments = (
    await ctx.repositories.enrollments.listBySection(session.academicYearId, session.sectionId)
  ).filter((e) => e.status === "ACTIVE");
  const enrollmentIds = enrollments.map((e) => e.id);

  const existing = new Map(
    (await ctx.repositories.attendanceRecords.listBySession(sessionId)).map((r) => [
      r.enrollmentId,
      r.status,
    ]),
  );
  const onLeave = new Set(
    await ctx.repositories.leaveRequests.approvedEnrollmentIdsOnDate(enrollmentIds, session.date),
  );

  return enrollments.map((e) => {
    const currentStatus = existing.get(e.id) ?? null;
    const suggestedStatus: AttendanceStatusKey = onLeave.has(e.id)
      ? "LEAVE"
      : (currentStatus ?? "PRESENT");
    return {
      enrollmentId: e.id,
      studentId: e.studentId,
      rollNo: e.rollNo,
      currentStatus,
      suggestedStatus,
    };
  });
}

/**
 * Bulk-mark a register: one idempotent upsert per (session, enrollment). Every
 * enrollment must be ACTIVE and belong to the session's section (blocks marking
 * another section or a withdrawn student). All marks + one audit row commit in a
 * single transaction, so a bad row rolls the whole batch back. DRAFT-only
 * (ADR-011 §5) — a SUBMITTED/LOCKED register changes only via a correction.
 */
export async function markAttendance(
  ctx: ServiceContext,
  input: MarkAttendanceInput,
): Promise<AttendanceRecordDto[]> {
  assertCan(ctx.user, PERMISSIONS.ATTENDANCE_MARK);
  await resolveActingStaffId(ctx); // B3: acting user must be staff
  const session = await loadSessionInSchool(ctx, input.sessionId);
  await assertTeachesSection(ctx, session.sectionId);

  // DRAFT-only (ADR-011 §5 state machine): a SUBMITTED/LOCKED register is the
  // official record; any later change goes through the correction workflow.
  if (session.status !== "DRAFT") {
    throw new ValidationError(
      session.status === "LOCKED"
        ? "This register is locked; submit a correction instead"
        : "This register is submitted; submit a correction to change it",
    );
  }
  if (input.marks.length === 0) {
    throw new ValidationError("No marks provided");
  }

  // Pre-validate every enrollment BEFORE writing anything (clean bulk rollback).
  for (const mark of input.marks) {
    const enrollment = await loadEnrollmentInSchool(ctx, mark.enrollmentId);
    if (enrollment.sectionId !== session.sectionId) {
      throw new ForbiddenError("Enrollment is not in this register's section");
    }
    if (enrollment.status !== "ACTIVE") {
      throw new ValidationError("Cannot mark attendance for a non-active enrollment");
    }
  }

  return ctx.withTransaction(async (repos) => {
    const saved: AttendanceRecordDto[] = [];
    for (const mark of input.marks) {
      const row = await repos.attendanceRecords.upsert({
        schoolId: ctx.user.schoolId,
        sessionId: session.id,
        enrollmentId: mark.enrollmentId,
        status: mark.status,
        remarks: mark.remarks ?? null,
      });
      saved.push(mapAttendanceRecord(row));
    }
    await recordAudit(ctx, repos, {
      action: "ATTENDANCE_MARK",
      entityType: "AttendanceSession",
      entityId: session.id,
      after: { markedCount: saved.length },
    });
    return saved;
  });
}

/** DRAFT → SUBMITTED (the day's official record). Stamps the acting staff. */
export async function submitSession(
  ctx: ServiceContext,
  sessionId: string,
): Promise<AttendanceSessionDto> {
  return transitionSession(ctx, sessionId, {
    from: "DRAFT",
    to: "SUBMITTED",
    action: "ATTENDANCE_SESSION_SUBMIT",
  });
}

/** SUBMITTED → LOCKED (closed to direct edits; corrections only). */
export async function lockSession(
  ctx: ServiceContext,
  sessionId: string,
): Promise<AttendanceSessionDto> {
  return transitionSession(ctx, sessionId, {
    from: "SUBMITTED",
    to: "LOCKED",
    action: "ATTENDANCE_SESSION_LOCK",
  });
}

/** Records of a session (admin/teacher own-section read). */
export async function listSessionRecords(
  ctx: ServiceContext,
  sessionId: string,
): Promise<AttendanceRecordDto[]> {
  assertCan(ctx.user, PERMISSIONS.ATTENDANCE_READ);
  const session = await loadSessionInSchool(ctx, sessionId);
  await assertTeachesSection(ctx, session.sectionId);
  const rows = await ctx.repositories.attendanceRecords.listBySession(sessionId);
  return rows.map(mapAttendanceRecord);
}

/** One enrollment's attendance records over a date range (in scope). */
export async function studentAttendanceHistory(
  ctx: ServiceContext,
  input: { enrollmentId: string; from: Date; to: Date },
): Promise<AttendanceRecordDto[]> {
  assertCan(ctx.user, PERMISSIONS.ATTENDANCE_READ);
  const enrollment = await loadEnrollmentInSchool(ctx, input.enrollmentId);
  await assertEnrollmentInScope(ctx, enrollment);
  const rows = await ctx.repositories.attendanceRecords.listByEnrollmentInRange(
    input.enrollmentId,
    input.from,
    input.to,
  );
  return rows.map(mapAttendanceRecord);
}

/**
 * Compute-on-read attendance % for an enrollment over a range (ADR-011 §10 — the
 * "Attendance Summary" deliverable). PRESENT/LATE = 1, HALF_DAY = 0.5, ABSENT =
 * 0; LEAVE is excluded from the denominator. No table, no cron — pure read.
 */
export async function attendanceSummary(
  ctx: ServiceContext,
  input: { enrollmentId: string; from: Date; to: Date },
): Promise<AttendanceSummaryDto> {
  assertCan(ctx.user, PERMISSIONS.ATTENDANCE_READ);
  const enrollment = await loadEnrollmentInSchool(ctx, input.enrollmentId);
  await assertEnrollmentInScope(ctx, enrollment);
  const rows = await ctx.repositories.attendanceRecords.listByEnrollmentInRange(
    input.enrollmentId,
    input.from,
    input.to,
  );

  const count = (s: AttendanceStatusKey) => rows.filter((r) => r.status === s).length;
  const present = count("PRESENT");
  const absent = count("ABSENT");
  const late = count("LATE");
  const halfDay = count("HALF_DAY");
  const leave = count("LEAVE");
  const countableDays = present + absent + late + halfDay; // LEAVE excluded
  const attended = present + late + halfDay * 0.5;

  return {
    enrollmentId: input.enrollmentId,
    from: toIstDateString(input.from),
    to: toIstDateString(input.to),
    present,
    absent,
    late,
    halfDay,
    leave,
    countableDays,
    percentage: countableDays === 0 ? null : Math.round((attended / countableDays) * 1000) / 10,
  };
}

/* ---- internal ---- */

async function transitionSession(
  ctx: ServiceContext,
  sessionId: string,
  t: { from: "DRAFT" | "SUBMITTED"; to: "SUBMITTED" | "LOCKED"; action: string },
): Promise<AttendanceSessionDto> {
  assertCan(ctx.user, PERMISSIONS.ATTENDANCE_MARK);
  const staffId = await resolveActingStaffId(ctx);
  const session = await loadSessionInSchool(ctx, sessionId);
  await assertTeachesSection(ctx, session.sectionId);

  if (session.status !== t.from) {
    throw new ValidationError(`Register must be ${t.from} to ${t.to.toLowerCase()} it`);
  }

  const now = new Date();
  const stamp =
    t.to === "SUBMITTED"
      ? { status: t.to, submittedByStaffId: staffId, submittedAt: now }
      : { status: t.to, lockedByStaffId: staffId, lockedAt: now };

  return ctx.withTransaction(async (repos) => {
    // Guarded transition: only succeeds if still in `from`; a concurrent writer
    // that already moved it gets null → Conflict (no double-transition/audit).
    const after = await repos.attendanceSessions.transition(session.id, t.from, stamp);
    if (!after) {
      throw new ConflictError(`Register was already ${t.to.toLowerCase()}`);
    }
    await recordAudit(ctx, repos, {
      action: t.action,
      entityType: "AttendanceSession",
      entityId: session.id,
      before: { status: session.status },
      after: { status: after.status },
    });
    return mapAttendanceSession(after);
  });
}

async function assertYearInSchool(ctx: ServiceContext, id: string): Promise<void> {
  const year = await ctx.repositories.academicYears.findById(id);
  if (!year || year.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Academic year not found");
  }
}

async function assertSectionInSchool(ctx: ServiceContext, id: string): Promise<void> {
  const section = await ctx.repositories.sections.findById(id);
  if (!section) {
    throw new NotFoundError("Section not found");
  }
  // Section carries no schoolId (it belongs via Class); tenant is single (ADR-008),
  // so existence is the check — teacher scope + the admin school-wide grant are the
  // effective boundary.
}

async function assertSubjectInSchool(ctx: ServiceContext, id: string): Promise<void> {
  const subject = await ctx.repositories.subjects.findById(id);
  if (!subject || subject.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Subject not found");
  }
}
