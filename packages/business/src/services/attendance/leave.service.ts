import { PERMISSIONS } from "@repo/constants";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@repo/core";
import type { Enrollment, LeaveRequest, Repositories } from "@repo/db";
import type { LeaveRequestDto, LeaveRequestStatusKey } from "@repo/types";

import { assertCan } from "../../authorization";
import type { ServiceContext } from "../../context";

import { mapLeave } from "./mappers";
import {
  eachDateInRange,
  formatIstDate,
  isFullAccess,
  isWorkingWeekday,
  loadEnrollmentInSchool,
  loadYearInSchool,
  parentChildIds,
  parseIstDate,
  recordAudit,
  requireActiveYear,
  teacherSectionIds,
} from "./scope";

export interface SubmitLeaveInput {
  enrollmentId: string;
  /** YYYY-MM-DD IST calendar dates, inclusive range. */
  fromDate: string;
  toDate: string;
  reason: string;
  /** Admin only: the parent the leave is recorded on behalf of (must be linked
   *  to the student). A PARENT actor always submits as themselves. */
  parentId?: string | undefined;
}

export interface ListLeaveInput {
  status?: LeaveRequestStatusKey | undefined;
  enrollmentId?: string | undefined;
}

/** Parent (own child) or admin (on a linked parent's behalf) files a leave request. */
export async function submitLeave(
  ctx: ServiceContext,
  input: SubmitLeaveInput,
): Promise<LeaveRequestDto> {
  assertCan(ctx.user, PERMISSIONS.LEAVE_SUBMIT);
  const enrollment = await loadEnrollmentInSchool(ctx, input.enrollmentId);
  if (enrollment.status !== "ACTIVE") {
    throw new ValidationError("Leave can only be requested for an active enrollment");
  }
  const parentId = await resolveRequestingParent(ctx, enrollment, input.parentId);

  const fromDate = parseIstDate(input.fromDate);
  const toDate = parseIstDate(input.toDate);
  if (fromDate > toDate) {
    throw new ValidationError("Leave start date must not be after its end date");
  }
  const year = await loadYearInSchool(ctx, enrollment.academicYearId);
  if (fromDate < year.startDate || toDate > year.endDate) {
    throw new ValidationError("Leave dates are outside the enrollment's academic year");
  }
  const overlap = await ctx.repositories.leaveRequests.findLiveOverlap(
    enrollment.id,
    fromDate,
    toDate,
  );
  if (overlap) {
    throw new ConflictError("An overlapping leave request already exists for this student");
  }

  return ctx.withTransaction(async (repos) => {
    const created = await repos.leaveRequests.create({
      schoolId: ctx.user.schoolId,
      enrollmentId: enrollment.id,
      parentId,
      fromDate,
      toDate,
      reason: input.reason,
    });
    await recordAudit(ctx, repos, {
      action: "LEAVE_SUBMIT",
      entityType: "LeaveRequest",
      entityId: created.id,
      after: {
        enrollmentId: enrollment.id,
        fromDate: input.fromDate,
        toDate: input.toDate,
      },
    });
    return mapLeave(created);
  });
}

/**
 * Approve a PENDING leave (admin). Writes LEAVE into that enrollment's records
 * in EXISTING sessions on covered school days; sessions created later pre-fill
 * from the approved leave at creation time (ADR-011 §5).
 */
export async function approveLeave(
  ctx: ServiceContext,
  id: string,
  decisionNote?: string,
): Promise<LeaveRequestDto> {
  assertCan(ctx.user, PERMISSIONS.LEAVE_DECIDE);
  const leave = await loadLeaveInSchool(ctx, id);
  if (leave.status !== "PENDING") {
    throw new ValidationError(`Only a pending leave can be approved (this one is ${leave.status})`);
  }
  const enrollment = await loadEnrollmentInSchool(ctx, leave.enrollmentId);
  if (enrollment.status !== "ACTIVE") {
    throw new ValidationError("Cannot approve leave: the enrollment is no longer active");
  }
  const schoolDays = await coveredSchoolDays(ctx, leave, enrollment.academicYearId);

  return ctx.withTransaction(async (repos) => {
    const decided = await repos.leaveRequests.decide(leave.id, {
      status: "APPROVED",
      decidedByUserId: ctx.user.userId,
      decidedAt: new Date(),
      decisionNote: decisionNote ?? null,
    });
    const applied = await rewriteLeaveRecords(ctx, repos, leave, schoolDays, "apply");
    await recordAudit(ctx, repos, {
      action: "LEAVE_APPROVE",
      entityType: "LeaveRequest",
      entityId: leave.id,
      before: { status: leave.status },
      after: { status: decided.status, recordsSetToLeave: applied },
    });
    return mapLeave(decided);
  });
}

/** Reject a PENDING leave (admin). No attendance effect. */
export async function rejectLeave(
  ctx: ServiceContext,
  id: string,
  decisionNote?: string,
): Promise<LeaveRequestDto> {
  assertCan(ctx.user, PERMISSIONS.LEAVE_DECIDE);
  const leave = await loadLeaveInSchool(ctx, id);
  if (leave.status !== "PENDING") {
    throw new ValidationError(`Only a pending leave can be rejected (this one is ${leave.status})`);
  }
  return ctx.withTransaction(async (repos) => {
    const decided = await repos.leaveRequests.decide(leave.id, {
      status: "REJECTED",
      decidedByUserId: ctx.user.userId,
      decidedAt: new Date(),
      decisionNote: decisionNote ?? null,
    });
    await recordAudit(ctx, repos, {
      action: "LEAVE_REJECT",
      entityType: "LeaveRequest",
      entityId: leave.id,
      before: { status: leave.status },
      after: { status: decided.status },
    });
    return mapLeave(decided);
  });
}

/**
 * Cancel a leave (the requesting parent, or admin). A PENDING leave just closes;
 * cancelling an APPROVED leave also reverts the LEAVE rows the approval wrote —
 * to ABSENT (the day happened and no presence was recorded; a teacher can file
 * a correction if the student actually attended).
 */
export async function cancelLeave(ctx: ServiceContext, id: string): Promise<LeaveRequestDto> {
  assertCan(ctx.user, PERMISSIONS.LEAVE_READ); // both parties hold it; ownership below
  const leave = await loadLeaveInSchool(ctx, id);
  if (!isFullAccess(ctx)) {
    if (ctx.user.role !== "PARENT") {
      throw new ForbiddenError("Only the requesting parent or an admin can cancel a leave");
    }
    const parent = await ctx.repositories.parents.findByUserId(ctx.user.userId);
    if (!parent || parent.id !== leave.parentId) {
      throw new ForbiddenError("Out of scope for this leave request");
    }
  }
  if (leave.status !== "PENDING" && leave.status !== "APPROVED") {
    throw new ValidationError(`A ${leave.status.toLowerCase()} leave cannot be cancelled`);
  }

  const enrollment = await loadEnrollmentInSchool(ctx, leave.enrollmentId);
  const schoolDays =
    leave.status === "APPROVED"
      ? await coveredSchoolDays(ctx, leave, enrollment.academicYearId)
      : [];

  return ctx.withTransaction(async (repos) => {
    const decided = await repos.leaveRequests.decide(leave.id, { status: "CANCELLED" });
    const reverted =
      leave.status === "APPROVED"
        ? await rewriteLeaveRecords(ctx, repos, leave, schoolDays, "revert")
        : 0;
    await recordAudit(ctx, repos, {
      action: "LEAVE_CANCEL",
      entityType: "LeaveRequest",
      entityId: leave.id,
      before: { status: leave.status },
      after: { status: decided.status, recordsReverted: reverted },
    });
    return mapLeave(decided);
  });
}

/** Leaves in scope: admin all; parent own; teacher those of sections they teach. */
export async function listLeaves(
  ctx: ServiceContext,
  input: ListLeaveInput = {},
): Promise<LeaveRequestDto[]> {
  assertCan(ctx.user, PERMISSIONS.LEAVE_READ);

  if (input.enrollmentId) {
    const enrollment = await loadEnrollmentInSchool(ctx, input.enrollmentId);
    await assertLeaveListScope(ctx, enrollment);
    const rows = await ctx.repositories.leaveRequests.list(ctx.user.schoolId, {
      enrollmentId: enrollment.id,
      status: input.status,
    });
    return rows.map(mapLeave);
  }

  if (isFullAccess(ctx)) {
    const rows = await ctx.repositories.leaveRequests.list(ctx.user.schoolId, {
      status: input.status,
    });
    return rows.map(mapLeave);
  }
  if (ctx.user.role === "PARENT") {
    const parent = await ctx.repositories.parents.findByUserId(ctx.user.userId);
    if (!parent) {
      return [];
    }
    const rows = await ctx.repositories.leaveRequests.list(ctx.user.schoolId, {
      parentId: parent.id,
      status: input.status,
    });
    return rows.map(mapLeave);
  }
  if (ctx.user.role === "TEACHER") {
    const enrollmentIds = await teacherEnrollmentIds(ctx);
    if (enrollmentIds.length === 0) {
      return [];
    }
    const rows = await ctx.repositories.leaveRequests.list(ctx.user.schoolId, {
      enrollmentIds,
      status: input.status,
    });
    return rows.map(mapLeave);
  }
  throw new ForbiddenError("Out of scope");
}

/* ---- internal helpers ---- */

async function loadLeaveInSchool(ctx: ServiceContext, id: string): Promise<LeaveRequest> {
  const leave = await ctx.repositories.leaveRequests.findById(id);
  if (!leave || leave.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Leave request not found");
  }
  return leave;
}

/** PARENT: own linked record for their own child. ADMIN: an explicit linked parentId. */
async function resolveRequestingParent(
  ctx: ServiceContext,
  enrollment: Enrollment,
  inputParentId: string | undefined,
): Promise<string> {
  if (ctx.user.role === "PARENT") {
    const children = await parentChildIds(ctx);
    if (!children.includes(enrollment.studentId)) {
      throw new ForbiddenError("Out of scope for this student");
    }
    const parent = await ctx.repositories.parents.findByUserId(ctx.user.userId);
    if (!parent) {
      throw new ForbiddenError("No parent record is linked to this account");
    }
    return parent.id;
  }
  // Admin path (office-recorded leave) — the named parent must be this student's.
  if (!inputParentId) {
    throw new ValidationError("parentId is required when an admin records a leave");
  }
  const links = await ctx.repositories.studentParents.listByStudent(enrollment.studentId);
  if (!links.some((link) => link.parentId === inputParentId)) {
    throw new ValidationError("That parent is not linked to this student");
  }
  return inputParentId;
}

/** Covered dates that are school days: working weekday AND not a Holiday (B1). */
async function coveredSchoolDays(
  ctx: ServiceContext,
  leave: LeaveRequest,
  academicYearId: string,
): Promise<Date[]> {
  const holidayDates = new Set(
    (
      await ctx.repositories.holidays.listDatesInRange(academicYearId, leave.fromDate, leave.toDate)
    ).map(formatIstDate),
  );
  return eachDateInRange(leave.fromDate, leave.toDate).filter(
    (d) => isWorkingWeekday(d) && !holidayDates.has(formatIstDate(d)),
  );
}

/**
 * Apply (→ LEAVE) or revert (LEAVE → ABSENT) this leave's rows in existing
 * sessions on the given dates. Only rows in the opposite state are touched;
 * each change is audited. Returns the number of records rewritten.
 */
async function rewriteLeaveRecords(
  ctx: ServiceContext,
  repos: Repositories,
  leave: LeaveRequest,
  schoolDays: readonly Date[],
  mode: "apply" | "revert",
): Promise<number> {
  const records = await repos.attendanceRecords.listByEnrollmentOnDates(
    leave.enrollmentId,
    schoolDays,
  );
  let rewritten = 0;
  for (const record of records) {
    const shouldTouch = mode === "apply" ? record.status !== "LEAVE" : record.status === "LEAVE";
    if (!shouldTouch) {
      continue;
    }
    const nextStatus = mode === "apply" ? ("LEAVE" as const) : ("ABSENT" as const);
    await repos.attendanceRecords.update(record.id, { status: nextStatus });
    await recordAudit(ctx, repos, {
      action: mode === "apply" ? "ATTENDANCE_RECORD_LEAVE_APPLY" : "ATTENDANCE_RECORD_LEAVE_REVERT",
      entityType: "AttendanceRecord",
      entityId: record.id,
      before: { status: record.status },
      after: { status: nextStatus, leaveRequestId: leave.id },
    });
    rewritten += 1;
  }
  return rewritten;
}

/** Per-enrollment leave list scope (admin any; parent own child; teacher own section). */
async function assertLeaveListScope(ctx: ServiceContext, enrollment: Enrollment): Promise<void> {
  if (isFullAccess(ctx)) {
    return;
  }
  if (ctx.user.role === "PARENT") {
    if ((await parentChildIds(ctx)).includes(enrollment.studentId)) {
      return;
    }
    throw new ForbiddenError("Out of scope for this student");
  }
  if (ctx.user.role === "TEACHER") {
    if (enrollment.sectionId && (await teacherSectionIds(ctx)).includes(enrollment.sectionId)) {
      return;
    }
    throw new ForbiddenError("Out of scope for this section");
  }
  throw new ForbiddenError("Out of scope");
}

/** ACTIVE-year enrollment ids of the sections this teacher teaches. */
async function teacherEnrollmentIds(ctx: ServiceContext): Promise<string[]> {
  const sectionIds = await teacherSectionIds(ctx);
  if (sectionIds.length === 0) {
    return [];
  }
  const year = await requireActiveYear(ctx);
  const ids: string[] = [];
  for (const sectionId of sectionIds) {
    const enrollments = await ctx.repositories.enrollments.listBySection(year.id, sectionId);
    ids.push(...enrollments.map((e) => e.id));
  }
  return ids;
}
