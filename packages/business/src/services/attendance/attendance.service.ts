import { PERMISSIONS } from "@repo/constants";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@repo/core";
import type { AttendanceSession, Section } from "@repo/db";
import type {
  AttendanceRecordDto,
  AttendanceRecordWithSessionDto,
  AttendanceSessionDto,
  AttendanceSessionTypeKey,
  AttendanceStatusKey,
  AttendanceSummaryDto,
} from "@repo/types";

import { assertCan } from "../../authorization";
import type { ServiceContext } from "../../context";

import { mapRecord, mapRecordWithSession, mapSession } from "./mappers";
import {
  assertEnrollmentReadable,
  assertSectionMarkable,
  formatIstDate,
  isFullAccess,
  loadEnrollmentInSchool,
  loadSessionInSchool,
  parseIstDate,
  recordAudit,
  requireActiveYear,
  teacherSectionIds,
} from "./scope";

export interface CreateSessionInput {
  sectionId: string;
  /** YYYY-MM-DD IST calendar date. */
  date: string;
  sessionType: AttendanceSessionTypeKey;
  subjectId?: string | undefined;
  /** Explicit, audited holiday override (ADR-011 §4). */
  isHolidayOverride?: boolean | undefined;
}

export interface SaveRecordsInput {
  sessionId: string;
  entries: readonly {
    enrollmentId: string;
    status: AttendanceStatusKey;
    note?: string | null | undefined;
  }[];
}

export interface ListSessionsInput {
  sectionId?: string | undefined;
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
}

export interface EnrollmentHistoryInput {
  enrollmentId: string;
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
}

export interface SessionWithRecordsDto {
  session: AttendanceSessionDto;
  records: AttendanceRecordDto[];
}

/**
 * Create one marking event for a section: the session header plus one record
 * per ACTIVE enrollment, defaulted PRESENT — except enrollments with an
 * APPROVED leave covering the date, which are pre-filled LEAVE (ADR-011 §5).
 */
export async function createSession(
  ctx: ServiceContext,
  input: CreateSessionInput,
): Promise<SessionWithRecordsDto> {
  assertCan(ctx.user, PERMISSIONS.ATTENDANCE_MARK);
  const section = await loadSectionInSchool(ctx, input.sectionId);
  await assertSectionMarkable(ctx, section.id);
  await assertSubjectRules(ctx, input);

  const year = await requireActiveYear(ctx);
  const date = parseIstDate(input.date);
  if (date < year.startDate || date > year.endDate) {
    throw new ValidationError("Date is outside the active academic year");
  }

  const holiday = await ctx.repositories.holidays.findByYearAndDate(year.id, date);
  if (holiday && !input.isHolidayOverride) {
    throw new ValidationError(
      `${input.date} is a holiday (${holiday.name}); set isHolidayOverride to mark anyway`,
    );
  }

  const duplicate = await ctx.repositories.attendanceSessions.findDuplicate(
    section.id,
    date,
    input.sessionType,
    input.subjectId ?? null,
  );
  if (duplicate) {
    throw new ConflictError("Attendance for this section, date and session already exists");
  }

  const roster = (await ctx.repositories.enrollments.listBySection(year.id, section.id)).filter(
    (e) => e.status === "ACTIVE",
  );
  if (roster.length === 0) {
    throw new ValidationError("No active students are enrolled in this section");
  }
  const onLeave = new Set(
    (
      await ctx.repositories.leaveRequests.listApprovedCovering(
        roster.map((e) => e.id),
        date,
      )
    ).map((l) => l.enrollmentId),
  );

  return ctx.withTransaction(async (repos) => {
    const session = await repos.attendanceSessions.create({
      schoolId: ctx.user.schoolId,
      academicYearId: year.id,
      sectionId: section.id,
      date,
      sessionType: input.sessionType,
      subjectId: input.subjectId ?? null,
      markedByUserId: ctx.user.userId,
      isHolidayOverride: Boolean(holiday && input.isHolidayOverride),
    });
    await repos.attendanceRecords.createMany(
      roster.map((e) => ({
        schoolId: ctx.user.schoolId,
        sessionId: session.id,
        enrollmentId: e.id,
        status: onLeave.has(e.id) ? ("LEAVE" as const) : ("PRESENT" as const),
      })),
    );
    await recordAudit(ctx, repos, {
      action: "ATTENDANCE_SESSION_CREATE",
      entityType: "AttendanceSession",
      entityId: session.id,
      after: {
        sectionId: section.id,
        date: input.date,
        sessionType: input.sessionType,
        subjectId: input.subjectId ?? null,
        records: roster.length,
        prefilledLeave: onLeave.size,
        isHolidayOverride: session.isHolidayOverride,
      },
    });
    const records = await repos.attendanceRecords.listBySession(session.id);
    return { session: mapSession(session), records: records.map(mapRecord) };
  });
}

/**
 * Bulk-save statuses on an OPEN session (the "mark all present → flip
 * absentees → save" flow; re-saving updates in place). LEAVE is never
 * hand-settable, and rows the leave workflow wrote cannot be changed here —
 * cancel the leave or file a correction instead.
 */
export async function saveRecords(
  ctx: ServiceContext,
  input: SaveRecordsInput,
): Promise<AttendanceRecordDto[]> {
  assertCan(ctx.user, PERMISSIONS.ATTENDANCE_MARK);
  const session = await loadSessionInSchool(ctx, input.sessionId);
  await assertSectionMarkable(ctx, session.sectionId);
  if (session.status !== "OPEN") {
    throw new ValidationError("Session is finalized; changes require an approved correction");
  }

  const existing = await ctx.repositories.attendanceRecords.listBySession(session.id);
  const byEnrollment = new Map(existing.map((r) => [r.enrollmentId, r]));
  for (const entry of input.entries) {
    if (entry.status === "LEAVE") {
      throw new ValidationError("LEAVE is set by the leave workflow, not by marking");
    }
    const current = byEnrollment.get(entry.enrollmentId);
    if (!current) {
      throw new ValidationError("A marked student is not on this session's roster");
    }
    if (current.status === "LEAVE") {
      throw new ValidationError(
        "This student is on approved leave; cancel the leave or file a correction",
      );
    }
  }

  return ctx.withTransaction(async (repos) => {
    for (const entry of input.entries) {
      const current = byEnrollment.get(entry.enrollmentId)!;
      const noteChanged = entry.note !== undefined && entry.note !== current.note;
      if (current.status === entry.status && !noteChanged) {
        continue;
      }
      await repos.attendanceRecords.update(current.id, {
        status: entry.status,
        ...(entry.note !== undefined ? { note: entry.note } : {}),
      });
      await recordAudit(ctx, repos, {
        action: "ATTENDANCE_RECORD_UPDATE",
        entityType: "AttendanceRecord",
        entityId: current.id,
        before: { status: current.status },
        after: { status: entry.status },
      });
    }
    const records = await repos.attendanceRecords.listBySession(session.id);
    return records.map(mapRecord);
  });
}

/** OPEN → FINALIZED: locks in-place edits; later changes go through corrections. */
export async function finalizeSession(
  ctx: ServiceContext,
  sessionId: string,
): Promise<AttendanceSessionDto> {
  assertCan(ctx.user, PERMISSIONS.ATTENDANCE_MARK);
  const session = await loadSessionInSchool(ctx, sessionId);
  await assertSectionMarkable(ctx, session.sectionId);
  if (session.status !== "OPEN") {
    throw new ValidationError("Session is already finalized");
  }
  return ctx.withTransaction(async (repos) => {
    const after = await repos.attendanceSessions.updateStatus(session.id, "FINALIZED");
    await recordAudit(ctx, repos, {
      action: "ATTENDANCE_SESSION_FINALIZE",
      entityType: "AttendanceSession",
      entityId: session.id,
      before: { status: session.status },
      after: { status: after.status },
    });
    return mapSession(after);
  });
}

/** Admin-only: FINALIZED → OPEN (e.g. a same-day mistake caught after finalize). */
export async function reopenSession(
  ctx: ServiceContext,
  sessionId: string,
): Promise<AttendanceSessionDto> {
  assertCan(ctx.user, PERMISSIONS.ATTENDANCE_MANAGE);
  const session = await loadSessionInSchool(ctx, sessionId);
  if (session.status !== "FINALIZED") {
    throw new ValidationError("Session is not finalized");
  }
  return ctx.withTransaction(async (repos) => {
    const after = await repos.attendanceSessions.updateStatus(session.id, "OPEN");
    await recordAudit(ctx, repos, {
      action: "ATTENDANCE_SESSION_REOPEN",
      entityType: "AttendanceSession",
      entityId: session.id,
      before: { status: session.status },
      after: { status: after.status },
    });
    return mapSession(after);
  });
}

/**
 * Admin-only mistake cleanup (wrong date/section caught immediately): deletes
 * the session AND its records in one audited transaction. Not for editing
 * history — that is what corrections are for.
 */
export async function deleteSession(ctx: ServiceContext, sessionId: string): Promise<void> {
  assertCan(ctx.user, PERMISSIONS.ATTENDANCE_MANAGE);
  const session = await loadSessionInSchool(ctx, sessionId);
  await ctx.withTransaction(async (repos) => {
    const removed = await repos.attendanceRecords.deleteBySession(session.id);
    await repos.attendanceSessions.delete(session.id);
    await recordAudit(ctx, repos, {
      action: "ATTENDANCE_SESSION_DELETE",
      entityType: "AttendanceSession",
      entityId: session.id,
      before: {
        sectionId: session.sectionId,
        date: formatIstDate(session.date),
        sessionType: session.sessionType,
        records: removed,
      },
    });
  });
}

/** A session with its records (admin any; teacher own-section). */
export async function getSession(
  ctx: ServiceContext,
  sessionId: string,
): Promise<SessionWithRecordsDto> {
  assertCan(ctx.user, PERMISSIONS.ATTENDANCE_READ);
  const session = await loadSessionInSchool(ctx, sessionId);
  await assertSessionReadable(ctx, session);
  const records = await ctx.repositories.attendanceRecords.listBySession(session.id);
  return { session: mapSession(session), records: records.map(mapRecord) };
}

/** Sessions in the ACTIVE year (admin any section; teacher own sections). */
export async function listSessions(
  ctx: ServiceContext,
  input: ListSessionsInput = {},
): Promise<AttendanceSessionDto[]> {
  assertCan(ctx.user, PERMISSIONS.ATTENDANCE_READ);
  const year = await requireActiveYear(ctx);

  let sectionIds: readonly string[] | undefined;
  if (isFullAccess(ctx)) {
    sectionIds = input.sectionId ? [input.sectionId] : undefined;
  } else if (ctx.user.role === "TEACHER") {
    const own = await teacherSectionIds(ctx);
    if (input.sectionId) {
      if (!own.includes(input.sectionId)) {
        throw new ForbiddenError("Out of scope for this section");
      }
      sectionIds = [input.sectionId];
    } else {
      if (own.length === 0) {
        return [];
      }
      sectionIds = own;
    }
  } else {
    throw new ForbiddenError("Out of scope"); // parents read via enrollment history
  }

  const rows = await ctx.repositories.attendanceSessions.list(ctx.user.schoolId, {
    academicYearId: year.id,
    sectionIds,
    dateFrom: input.dateFrom ? parseIstDate(input.dateFrom) : undefined,
    dateTo: input.dateTo ? parseIstDate(input.dateTo) : undefined,
  });
  return rows.map(mapSession);
}

/**
 * An enrollment's attendance history with session context (admin any; teacher
 * own-section; parent own-child). History survives promotion by construction:
 * each year's records stay on that year's enrollment (ADR-011 §2).
 */
export async function enrollmentHistory(
  ctx: ServiceContext,
  input: EnrollmentHistoryInput,
): Promise<AttendanceRecordWithSessionDto[]> {
  assertCan(ctx.user, PERMISSIONS.ATTENDANCE_READ);
  const enrollment = await loadEnrollmentInSchool(ctx, input.enrollmentId);
  await assertEnrollmentReadable(ctx, enrollment);
  const rows = await ctx.repositories.attendanceRecords.listByEnrollment(
    enrollment.id,
    input.dateFrom ? parseIstDate(input.dateFrom) : undefined,
    input.dateTo ? parseIstDate(input.dateTo) : undefined,
  );
  return rows.map(mapRecordWithSession);
}

/**
 * Per-enrollment aggregate. Percentage policy (ADR-011): LATE counts present,
 * HALF_DAY weighs 0.5, LEAVE (excused) leaves the denominator, ABSENT counts
 * against. Null when nothing countable exists.
 */
export async function enrollmentSummary(
  ctx: ServiceContext,
  enrollmentId: string,
): Promise<AttendanceSummaryDto> {
  assertCan(ctx.user, PERMISSIONS.ATTENDANCE_READ);
  const enrollment = await loadEnrollmentInSchool(ctx, enrollmentId);
  await assertEnrollmentReadable(ctx, enrollment);
  const counts = await ctx.repositories.attendanceRecords.countByStatus(enrollment.id);
  const total = counts.PRESENT + counts.ABSENT + counts.LATE + counts.HALF_DAY + counts.LEAVE;
  const countable = total - counts.LEAVE;
  const attended = counts.PRESENT + counts.LATE + counts.HALF_DAY * 0.5;
  return {
    enrollmentId: enrollment.id,
    totalRecords: total,
    present: counts.PRESENT,
    absent: counts.ABSENT,
    late: counts.LATE,
    halfDay: counts.HALF_DAY,
    leave: counts.LEAVE,
    percentage: countable === 0 ? null : Math.round((attended / countable) * 1000) / 10,
  };
}

/* ---- internal loaders / validators ---- */

/** Section tenant check walks Section → Class.schoolId (Section carries no schoolId). */
async function loadSectionInSchool(ctx: ServiceContext, sectionId: string): Promise<Section> {
  const section = await ctx.repositories.sections.findById(sectionId);
  if (!section) {
    throw new NotFoundError("Section not found");
  }
  const klass = await ctx.repositories.classes.findById(section.classId);
  if (!klass || klass.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Section not found");
  }
  return section;
}

/**
 * SUBJECT sessions require a subject (in school); daily sessions must not carry
 * one. A teacher creating a SUBJECT session must hold the exact
 * (teacher, subject, section) assignment, not just any assignment in the section.
 */
async function assertSubjectRules(ctx: ServiceContext, input: CreateSessionInput): Promise<void> {
  if (input.sessionType === "SUBJECT") {
    if (!input.subjectId) {
      throw new ValidationError("A subject session requires a subject");
    }
    const subject = await ctx.repositories.subjects.findById(input.subjectId);
    if (!subject || subject.schoolId !== ctx.user.schoolId) {
      throw new NotFoundError("Subject not found");
    }
    if (!isFullAccess(ctx)) {
      const assignment = await ctx.repositories.teacherAssignments.findByTriple(
        ctx.user.userId,
        input.subjectId,
        input.sectionId,
      );
      if (!assignment) {
        throw new ForbiddenError("You are not assigned to teach this subject in this section");
      }
    }
    return;
  }
  if (input.subjectId) {
    throw new ValidationError("Only subject sessions may carry a subject");
  }
}

/** Read scope for a session row: admin any; teacher own-section (parents use history). */
async function assertSessionReadable(
  ctx: ServiceContext,
  session: AttendanceSession,
): Promise<void> {
  if (isFullAccess(ctx)) {
    return;
  }
  if (ctx.user.role === "TEACHER" && (await teacherSectionIds(ctx)).includes(session.sectionId)) {
    return;
  }
  throw new ForbiddenError("Out of scope for this section");
}
