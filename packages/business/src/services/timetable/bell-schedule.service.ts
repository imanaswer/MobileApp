import { PERMISSIONS } from "@repo/constants";
import { ConflictError } from "@repo/core";
import type { BellScheduleDto } from "@repo/types";

import { assertCan } from "../../authorization";
import type { ServiceContext } from "../../context";

import { mapBellSchedule } from "./mappers";
import { assertYearInSchool, loadBellScheduleInSchool } from "./scope";

/**
 * Bell-schedule management (M9, ADR-017). The bell schedule is the year's day
 * structure — EXACTLY ONE per year (DB unique `(schoolId, academicYearId)`).
 * Management is admin-only under `timetable:manage`; reads under `timetable:read`.
 * Every mutation writes AuditLog in the same transaction (ADR-007).
 */

export interface CreateBellScheduleInput {
  academicYearId: string;
  name: string;
}

/** The single bell schedule of a year, or null. Any timetable reader. */
export async function getBellScheduleForYear(
  ctx: ServiceContext,
  academicYearId: string,
): Promise<BellScheduleDto | null> {
  assertCan(ctx.user, PERMISSIONS.TIMETABLE_READ);
  const row = await ctx.repositories.bellSchedules.findByYear(academicYearId);
  if (!row || row.schoolId !== ctx.user.schoolId) {
    return null;
  }
  return mapBellSchedule(row);
}

/** Create the year's bell schedule (one only). Admin-only, audited. */
export async function createBellSchedule(
  ctx: ServiceContext,
  input: CreateBellScheduleInput,
): Promise<BellScheduleDto> {
  assertCan(ctx.user, PERMISSIONS.TIMETABLE_MANAGE);
  await assertYearInSchool(ctx, input.academicYearId);

  const existing = await ctx.repositories.bellSchedules.findByYear(input.academicYearId);
  if (existing) {
    throw new ConflictError("This year already has a bell schedule");
  }

  return ctx.withTransaction(async (repos) => {
    const created = await repos.bellSchedules.create({
      schoolId: ctx.user.schoolId,
      academicYearId: input.academicYearId,
      name: input.name,
    });
    await repos.audit.record({
      schoolId: ctx.user.schoolId,
      actorUserId: ctx.user.userId,
      action: "BELL_SCHEDULE_CREATE",
      entityType: "BellSchedule",
      entityId: created.id,
      after: { academicYearId: created.academicYearId, name: created.name },
    });
    return mapBellSchedule(created);
  });
}

/** Rename the year's bell schedule. Admin-only, audited. */
export async function updateBellSchedule(
  ctx: ServiceContext,
  id: string,
  name: string,
): Promise<BellScheduleDto> {
  assertCan(ctx.user, PERMISSIONS.TIMETABLE_MANAGE);
  const before = await loadBellScheduleInSchool(ctx, id);

  return ctx.withTransaction(async (repos) => {
    const updated = await repos.bellSchedules.update(id, { name });
    await repos.audit.record({
      schoolId: ctx.user.schoolId,
      actorUserId: ctx.user.userId,
      action: "BELL_SCHEDULE_UPDATE",
      entityType: "BellSchedule",
      entityId: updated.id,
      before: { name: before.name },
      after: { name: updated.name },
    });
    return mapBellSchedule(updated);
  });
}
