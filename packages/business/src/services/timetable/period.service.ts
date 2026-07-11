import { PERMISSIONS } from "@repo/constants";
import { ConflictError, ValidationError } from "@repo/core";
import type { Period } from "@repo/db";
import type { PeriodDto } from "@repo/types";

import { assertCan } from "../../authorization";
import type { ServiceContext } from "../../context";

import { formatClock, mapPeriod, parseClock } from "./mappers";
import { loadBellScheduleInSchool, loadPeriodInSchool } from "./scope";

/**
 * Period management (M9, ADR-017). A period is a numbered clock-time slot within
 * the year's bell schedule. `order` is 1-based and unique per schedule (DB); time
 * windows must be well-formed (`startTime < endTime`, DB CHECK) and must NOT overlap
 * a sibling — the overlap rule is business-layer (ADR-017 §2). Admin-only; audited.
 */

export interface CreatePeriodInput {
  bellScheduleId: string;
  name: string;
  order: number;
  /** "HH:MM" 24-hour. */
  startTime: string;
  endTime: string;
  isBreak: boolean;
}

export interface UpdatePeriodInput {
  name?: string;
  order?: number;
  startTime?: string;
  endTime?: string;
  isBreak?: boolean;
}

/** Periods of a bell schedule, in order. Any timetable reader. */
export async function listPeriods(
  ctx: ServiceContext,
  bellScheduleId: string,
): Promise<PeriodDto[]> {
  assertCan(ctx.user, PERMISSIONS.TIMETABLE_READ);
  await loadBellScheduleInSchool(ctx, bellScheduleId);
  const rows = await ctx.repositories.periods.listBySchedule(bellScheduleId);
  return rows.map(mapPeriod);
}

/** Add a period to the schedule. Admin-only, audited. */
export async function createPeriod(
  ctx: ServiceContext,
  input: CreatePeriodInput,
): Promise<PeriodDto> {
  assertCan(ctx.user, PERMISSIONS.TIMETABLE_MANAGE);
  await loadBellScheduleInSchool(ctx, input.bellScheduleId);

  if (input.order <= 0) {
    throw new ValidationError("Period order must be greater than 0");
  }
  const start = parseClock(input.startTime);
  const end = parseClock(input.endTime);
  assertWellFormed(start, end);

  const siblings = await ctx.repositories.periods.listBySchedule(input.bellScheduleId);
  assertNoOrderClash(siblings, input.order, null);
  assertNoOverlap(siblings, start, end, null);

  return ctx.withTransaction(async (repos) => {
    const created = await repos.periods.create({
      schoolId: ctx.user.schoolId,
      bellScheduleId: input.bellScheduleId,
      name: input.name,
      order: input.order,
      startTime: start,
      endTime: end,
      isBreak: input.isBreak,
    });
    await repos.audit.record({
      schoolId: ctx.user.schoolId,
      actorUserId: ctx.user.userId,
      action: "PERIOD_CREATE",
      entityType: "Period",
      entityId: created.id,
      after: auditShape(created),
    });
    return mapPeriod(created);
  });
}

/** Edit a period (name / order / times / break). Admin-only, audited. */
export async function updatePeriod(
  ctx: ServiceContext,
  id: string,
  input: UpdatePeriodInput,
): Promise<PeriodDto> {
  assertCan(ctx.user, PERMISSIONS.TIMETABLE_MANAGE);
  const before = await loadPeriodInSchool(ctx, id);

  const order = input.order ?? before.order;
  if (order <= 0) {
    throw new ValidationError("Period order must be greater than 0");
  }
  const start = input.startTime ? parseClock(input.startTime) : before.startTime;
  const end = input.endTime ? parseClock(input.endTime) : before.endTime;
  assertWellFormed(start, end);

  const siblings = await ctx.repositories.periods.listBySchedule(before.bellScheduleId);
  assertNoOrderClash(siblings, order, id);
  assertNoOverlap(siblings, start, end, id);

  return ctx.withTransaction(async (repos) => {
    const updated = await repos.periods.update(id, {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.order !== undefined && { order: input.order }),
      ...(input.startTime !== undefined && { startTime: start }),
      ...(input.endTime !== undefined && { endTime: end }),
      ...(input.isBreak !== undefined && { isBreak: input.isBreak }),
    });
    await repos.audit.record({
      schoolId: ctx.user.schoolId,
      actorUserId: ctx.user.userId,
      action: "PERIOD_UPDATE",
      entityType: "Period",
      entityId: updated.id,
      before: auditShape(before),
      after: auditShape(updated),
    });
    return mapPeriod(updated);
  });
}

/** Delete a period. Blocked if any timetable entry references it (Restrict). Admin-only, audited. */
export async function deletePeriod(ctx: ServiceContext, id: string): Promise<void> {
  assertCan(ctx.user, PERMISSIONS.TIMETABLE_MANAGE);
  const before = await loadPeriodInSchool(ctx, id);
  if (await ctx.repositories.timetableEntries.existsForPeriod(id)) {
    throw new ConflictError("Period is used by timetable entries; remove them first");
  }
  await ctx.withTransaction(async (repos) => {
    await repos.periods.delete(id);
    await repos.audit.record({
      schoolId: ctx.user.schoolId,
      actorUserId: ctx.user.userId,
      action: "PERIOD_DELETE",
      entityType: "Period",
      entityId: id,
      before: auditShape(before),
    });
  });
}

/* ---- validation helpers ---- */

function assertWellFormed(start: Date, end: Date): void {
  if (start.getTime() >= end.getTime()) {
    throw new ValidationError("Period start time must be before its end time");
  }
}

function assertNoOrderClash(siblings: Period[], order: number, excludeId: string | null): void {
  if (siblings.some((p) => p.id !== excludeId && p.order === order)) {
    throw new ConflictError(`Another period already uses order ${order} in this schedule`);
  }
}

function assertNoOverlap(
  siblings: Period[],
  start: Date,
  end: Date,
  excludeId: string | null,
): void {
  const clash = siblings.find(
    (p) =>
      p.id !== excludeId &&
      start.getTime() < p.endTime.getTime() &&
      p.startTime.getTime() < end.getTime(),
  );
  if (clash) {
    throw new ConflictError(
      `Period times overlap "${clash.name}" (${formatClock(clash.startTime)}–${formatClock(clash.endTime)})`,
    );
  }
}

function auditShape(p: Period) {
  return {
    name: p.name,
    order: p.order,
    startTime: formatClock(p.startTime),
    endTime: formatClock(p.endTime),
    isBreak: p.isBreak,
  };
}
