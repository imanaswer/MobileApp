import { PERMISSIONS } from "@repo/constants";
import { ConflictError, NotFoundError, ValidationError } from "@repo/core";
import type { AttendanceCorrection, AttendanceRecordWithDate } from "@repo/db";
import type { AttendanceCorrectionDto, AttendanceStatusKey, PendingCorrectionDto } from "@repo/types";

import { assertCan } from "../../authorization";
import type { ServiceContext } from "../../context";

import { mapAttendanceCorrection } from "./mappers";
import {
  assertTeachesSection,
  loadSessionInSchool,
  recordAudit,
  resolveActingStaffId,
  studentNameForEnrollment,
  toIstDateString,
} from "./scope";

export interface SubmitCorrectionInput {
  attendanceRecordId: string;
  requestedStatus: AttendanceStatusKey;
  reason: string;
}

/**
 * Submit an immutable correction request against a record (ADR-011 §8). Snapshots
 * the record's current status as `previousStatus`; the request is never edited.
 * Teacher scope: must teach the record's section.
 */
export async function submitCorrection(
  ctx: ServiceContext,
  input: SubmitCorrectionInput,
): Promise<AttendanceCorrectionDto> {
  assertCan(ctx.user, PERMISSIONS.ATTENDANCE_CORRECT_SUBMIT);
  const staffId = await resolveActingStaffId(ctx);
  const record = await loadRecordInSchool(ctx, input.attendanceRecordId);
  const session = await loadSessionInSchool(ctx, record.sessionId);
  await assertTeachesSection(ctx, session.sectionId);

  if (input.requestedStatus === record.status) {
    throw new ValidationError("Requested status equals the current status");
  }

  return ctx.withTransaction(async (repos) => {
    const created = await repos.attendanceCorrections.create({
      schoolId: ctx.user.schoolId,
      attendanceRecordId: record.id,
      requestedByStaffId: staffId,
      previousStatus: record.status,
      requestedStatus: input.requestedStatus,
      reason: input.reason,
    });
    await recordAudit(ctx, repos, {
      action: "ATTENDANCE_CORRECTION_SUBMIT",
      entityType: "AttendanceCorrection",
      entityId: created.id,
      after: {
        attendanceRecordId: record.id,
        previousStatus: created.previousStatus,
        requestedStatus: created.requestedStatus,
      },
    });
    return mapAttendanceCorrection(created);
  });
}

/**
 * Approve or reject a PENDING correction. On APPROVE (one transaction): the
 * record's status becomes `requestedStatus`, the correction is stamped APPROVED,
 * and an AuditLog captures old→new — the record is never overwritten silently
 * (ADR-011 §8). An optimistic guard rejects if the record drifted since the
 * request (stacked corrections can't clobber each other). REJECT leaves the
 * record untouched.
 */
export async function decideCorrection(
  ctx: ServiceContext,
  input: { correctionId: string; decision: "APPROVED" | "REJECTED" },
): Promise<AttendanceCorrectionDto> {
  assertCan(ctx.user, PERMISSIONS.ATTENDANCE_CORRECT_DECIDE);
  const staffId = await resolveActingStaffId(ctx);
  const correction = await loadCorrectionInSchool(ctx, input.correctionId);
  if (correction.status !== "PENDING") {
    throw new ConflictError(`Correction is already ${correction.status.toLowerCase()}`);
  }

  if (input.decision === "REJECTED") {
    return ctx.withTransaction(async (repos) => {
      const after = await repos.attendanceCorrections.decide(correction.id, {
        status: "REJECTED",
        decidedByStaffId: staffId,
        decidedAt: new Date(),
      });
      if (!after) {
        throw new ConflictError("Correction was already decided");
      }
      await recordAudit(ctx, repos, {
        action: "ATTENDANCE_CORRECTION_REJECT",
        entityType: "AttendanceCorrection",
        entityId: correction.id,
        before: { status: "PENDING" },
        after: { status: after.status },
      });
      return mapAttendanceCorrection(after);
    });
  }

  const record = await loadRecordInSchool(ctx, correction.attendanceRecordId);
  if (record.status !== correction.previousStatus) {
    throw new ConflictError("The record changed since this correction was requested");
  }

  return ctx.withTransaction(async (repos) => {
    // Claim the correction first (guarded PENDING→APPROVED). A concurrent approver
    // that already claimed it gets null → Conflict, so the record change + audit
    // apply exactly once.
    const after = await repos.attendanceCorrections.decide(correction.id, {
      status: "APPROVED",
      decidedByStaffId: staffId,
      decidedAt: new Date(),
    });
    if (!after) {
      throw new ConflictError("Correction was already decided");
    }
    await repos.attendanceRecords.updateStatus(record.id, correction.requestedStatus);
    await recordAudit(ctx, repos, {
      action: "ATTENDANCE_CORRECTION_APPROVE",
      entityType: "AttendanceRecord",
      entityId: record.id,
      before: { status: record.status },
      after: { status: correction.requestedStatus },
    });
    return mapAttendanceCorrection(after);
  });
}

/** Pending correction queue for approvers, enriched with student name + the
 *  record's date so the admin can decide without extra lookups. */
export async function listPendingCorrections(
  ctx: ServiceContext,
): Promise<PendingCorrectionDto[]> {
  assertCan(ctx.user, PERMISSIONS.ATTENDANCE_CORRECT_DECIDE);
  const rows = await ctx.repositories.attendanceCorrections.listPending(ctx.user.schoolId);
  return Promise.all(
    rows.map(async (row) => {
      const record = await ctx.repositories.attendanceRecords.findById(row.attendanceRecordId);
      return {
        ...mapAttendanceCorrection(row),
        studentName: record
          ? await studentNameForEnrollment(ctx, record.enrollmentId)
          : row.attendanceRecordId,
        date: record ? toIstDateString(record.session.date) : ("" as PendingCorrectionDto["date"]),
      };
    }),
  );
}

/** The acting staff member's own submitted corrections + their status (mobile). */
export async function listMyCorrections(ctx: ServiceContext): Promise<AttendanceCorrectionDto[]> {
  assertCan(ctx.user, PERMISSIONS.ATTENDANCE_CORRECT_SUBMIT);
  const staffId = await resolveActingStaffId(ctx);
  const rows = await ctx.repositories.attendanceCorrections.listByRequester(staffId);
  return rows.map(mapAttendanceCorrection);
}

/* ---- internal ---- */

async function loadRecordInSchool(ctx: ServiceContext, id: string): Promise<AttendanceRecordWithDate> {
  const row = await ctx.repositories.attendanceRecords.findById(id);
  if (!row || row.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Attendance record not found");
  }
  return row;
}

async function loadCorrectionInSchool(
  ctx: ServiceContext,
  id: string,
): Promise<AttendanceCorrection> {
  const row = await ctx.repositories.attendanceCorrections.findById(id);
  if (!row || row.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Correction not found");
  }
  return row;
}
