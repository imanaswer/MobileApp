import { PERMISSIONS } from "@repo/constants";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@repo/core";
import type { AttendanceCorrection } from "@repo/db";
import type {
  AttendanceCorrectionDto,
  AttendanceCorrectionStatusKey,
  AttendanceStatusKey,
} from "@repo/types";

import { assertCan } from "../../authorization";
import type { ServiceContext } from "../../context";

import { mapCorrection } from "./mappers";
import { isFullAccess, recordAudit, teacherSectionIds } from "./scope";

export interface RequestCorrectionInput {
  attendanceRecordId: string;
  toStatus: AttendanceStatusKey;
  reason: string;
}

export interface ListCorrectionsInput {
  status?: AttendanceCorrectionStatusKey | undefined;
  /** Only the actor's own requests (teacher "my corrections" view). */
  mine?: boolean | undefined;
}

/**
 * File a correction against a record (teacher → own-section records; admin →
 * any). The row captures the before/after pair so history is never silently
 * overwritten (ADR-011 §6); nothing changes until an admin approves.
 */
export async function requestCorrection(
  ctx: ServiceContext,
  input: RequestCorrectionInput,
): Promise<AttendanceCorrectionDto> {
  assertCan(ctx.user, PERMISSIONS.CORRECTION_REQUEST);
  const record = await loadRecordWithSession(ctx, input.attendanceRecordId);
  if (!isFullAccess(ctx)) {
    if (
      ctx.user.role !== "TEACHER" ||
      !(await teacherSectionIds(ctx)).includes(record.session.sectionId)
    ) {
      throw new ForbiddenError("Out of scope for this section");
    }
  }
  if (input.toStatus === "LEAVE") {
    throw new ValidationError("LEAVE is set by the leave workflow, not by a correction");
  }
  if (input.toStatus === record.status) {
    throw new ValidationError("The proposed status matches the record's current status");
  }
  if (await ctx.repositories.attendanceCorrections.findPendingByRecord(record.id)) {
    throw new ConflictError("A pending correction already exists for this record");
  }

  return ctx.withTransaction(async (repos) => {
    const created = await repos.attendanceCorrections.create({
      schoolId: ctx.user.schoolId,
      attendanceRecordId: record.id,
      requestedByUserId: ctx.user.userId,
      fromStatus: record.status,
      toStatus: input.toStatus,
      reason: input.reason,
    });
    await recordAudit(ctx, repos, {
      action: "CORRECTION_REQUEST",
      entityType: "AttendanceCorrection",
      entityId: created.id,
      after: {
        attendanceRecordId: record.id,
        fromStatus: created.fromStatus,
        toStatus: created.toStatus,
      },
    });
    return mapCorrection(created);
  });
}

/**
 * Approve a PENDING correction (admin): the record flips to `toStatus` and the
 * correction closes, in ONE transaction with both audit rows. Stale corrections
 * (the record changed since filing) are refused — reject and re-file.
 */
export async function approveCorrection(
  ctx: ServiceContext,
  id: string,
  decisionNote?: string,
): Promise<AttendanceCorrectionDto> {
  assertCan(ctx.user, PERMISSIONS.CORRECTION_DECIDE);
  const correction = await loadCorrectionInSchool(ctx, id);
  if (correction.status !== "PENDING") {
    throw new ValidationError(
      `Only a pending correction can be approved (this one is ${correction.status})`,
    );
  }
  const record = await ctx.repositories.attendanceRecords.findById(correction.attendanceRecordId);
  if (!record) {
    throw new NotFoundError("The corrected attendance record no longer exists");
  }
  if (record.status !== correction.fromStatus) {
    throw new ConflictError(
      "The record changed after this correction was filed; reject it and file a new one",
    );
  }

  return ctx.withTransaction(async (repos) => {
    await repos.attendanceRecords.update(record.id, { status: correction.toStatus });
    const decided = await repos.attendanceCorrections.decide(correction.id, {
      status: "APPROVED",
      decidedByUserId: ctx.user.userId,
      decidedAt: new Date(),
      decisionNote: decisionNote ?? null,
    });
    await recordAudit(ctx, repos, {
      action: "ATTENDANCE_RECORD_CORRECT",
      entityType: "AttendanceRecord",
      entityId: record.id,
      before: { status: correction.fromStatus },
      after: { status: correction.toStatus, correctionId: correction.id },
    });
    await recordAudit(ctx, repos, {
      action: "CORRECTION_APPROVE",
      entityType: "AttendanceCorrection",
      entityId: correction.id,
      before: { status: correction.status },
      after: { status: decided.status },
    });
    return mapCorrection(decided);
  });
}

/** Reject a PENDING correction (admin). The record is untouched. */
export async function rejectCorrection(
  ctx: ServiceContext,
  id: string,
  decisionNote?: string,
): Promise<AttendanceCorrectionDto> {
  assertCan(ctx.user, PERMISSIONS.CORRECTION_DECIDE);
  const correction = await loadCorrectionInSchool(ctx, id);
  if (correction.status !== "PENDING") {
    throw new ValidationError(
      `Only a pending correction can be rejected (this one is ${correction.status})`,
    );
  }
  return ctx.withTransaction(async (repos) => {
    const decided = await repos.attendanceCorrections.decide(correction.id, {
      status: "REJECTED",
      decidedByUserId: ctx.user.userId,
      decidedAt: new Date(),
      decisionNote: decisionNote ?? null,
    });
    await recordAudit(ctx, repos, {
      action: "CORRECTION_REJECT",
      entityType: "AttendanceCorrection",
      entityId: correction.id,
      before: { status: correction.status },
      after: { status: decided.status },
    });
    return mapCorrection(decided);
  });
}

/** Corrections in scope: admin all; teacher own-section (optionally only own requests). */
export async function listCorrections(
  ctx: ServiceContext,
  input: ListCorrectionsInput = {},
): Promise<AttendanceCorrectionDto[]> {
  assertCan(ctx.user, PERMISSIONS.CORRECTION_READ);

  if (isFullAccess(ctx)) {
    const rows = await ctx.repositories.attendanceCorrections.list(ctx.user.schoolId, {
      status: input.status,
      requestedByUserId: input.mine ? ctx.user.userId : undefined,
    });
    return rows.map(mapCorrection);
  }
  if (ctx.user.role === "TEACHER") {
    const sectionIds = await teacherSectionIds(ctx);
    if (sectionIds.length === 0) {
      return [];
    }
    const rows = await ctx.repositories.attendanceCorrections.list(ctx.user.schoolId, {
      status: input.status,
      sectionIds,
      requestedByUserId: input.mine ? ctx.user.userId : undefined,
    });
    return rows.map(mapCorrection);
  }
  throw new ForbiddenError("Out of scope");
}

/* ---- internal loaders ---- */

async function loadRecordWithSession(ctx: ServiceContext, id: string) {
  const record = await ctx.repositories.attendanceRecords.findByIdWithSession(id);
  if (!record || record.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Attendance record not found");
  }
  return record;
}

async function loadCorrectionInSchool(
  ctx: ServiceContext,
  id: string,
): Promise<AttendanceCorrection> {
  const correction = await ctx.repositories.attendanceCorrections.findById(id);
  if (!correction || correction.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Correction not found");
  }
  return correction;
}
