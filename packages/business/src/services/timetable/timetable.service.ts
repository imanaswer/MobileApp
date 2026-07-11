import { PERMISSIONS } from "@repo/constants";
import { ConflictError, ValidationError } from "@repo/core";
import type { TimetableEntry, Weekday } from "@repo/db";
import type { TimetableEntryDto } from "@repo/types";

import { assertCan } from "../../authorization";
import type { ServiceContext } from "../../context";

import { enrichEntries, enrichEntry, istWeekday, toWeekday } from "./mappers";
import {
  assertSectionInSchool,
  assertSectionReadScope,
  assertSubjectInSchool,
  assertTeacherAssignedToSubjectSection,
  assertYearInSchool,
  isFullAccess,
  loadEntryInSchool,
  loadPeriodInSchool,
  parentActiveEnrollmentsInYear,
} from "./scope";

/**
 * Timetable-entry management + read views (M9, ADR-017). An entry is one weekly
 * slot: section × weekday × period → subject + teacher + room. Ownership is DERIVED
 * from `TeacherAssignment` (never `ClassTeacherAssignment`); double-booking is a DB
 * unique with a friendly business pre-check; period must belong to the year's bell
 * schedule and must not be a break. Management is admin-only under
 * `timetable:manage`; reads under `timetable:read` carry role row-scope. Every
 * mutation writes AuditLog in the same transaction (ADR-007).
 */

export interface CreateTimetableEntryInput {
  academicYearId: string;
  sectionId: string;
  subjectId: string;
  teacherId: string;
  periodId: string;
  weekday: string;
  room?: string | null;
}

export interface UpdateTimetableEntryInput {
  subjectId?: string;
  teacherId?: string;
  periodId?: string;
  weekday?: string;
  room?: string | null;
}

/** Create a timetable entry. Admin-only, audited. */
export async function createTimetableEntry(
  ctx: ServiceContext,
  input: CreateTimetableEntryInput,
): Promise<TimetableEntryDto> {
  assertCan(ctx.user, PERMISSIONS.TIMETABLE_MANAGE);
  const weekday = toWeekday(input.weekday);
  await validateSlot(ctx, {
    academicYearId: input.academicYearId,
    sectionId: input.sectionId,
    subjectId: input.subjectId,
    teacherId: input.teacherId,
    periodId: input.periodId,
    weekday,
    excludeId: null,
  });

  return ctx.withTransaction(async (repos) => {
    const created = await repos.timetableEntries.create({
      schoolId: ctx.user.schoolId,
      academicYearId: input.academicYearId,
      sectionId: input.sectionId,
      subjectId: input.subjectId,
      teacherId: input.teacherId,
      periodId: input.periodId,
      weekday,
      room: input.room ?? null,
    });
    await repos.audit.record({
      schoolId: ctx.user.schoolId,
      actorUserId: ctx.user.userId,
      action: "TIMETABLE_ENTRY_CREATE",
      entityType: "TimetableEntry",
      entityId: created.id,
      after: auditShape(created),
    });
    return enrichEntry(ctx, created);
  });
}

/** Edit a timetable entry (subject / teacher / period / weekday / room). Admin-only, audited. */
export async function updateTimetableEntry(
  ctx: ServiceContext,
  id: string,
  input: UpdateTimetableEntryInput,
): Promise<TimetableEntryDto> {
  assertCan(ctx.user, PERMISSIONS.TIMETABLE_MANAGE);
  const before = await loadEntryInSchool(ctx, id);

  const next = {
    subjectId: input.subjectId ?? before.subjectId,
    teacherId: input.teacherId ?? before.teacherId,
    periodId: input.periodId ?? before.periodId,
    weekday: input.weekday ? toWeekday(input.weekday) : before.weekday,
  };
  await validateSlot(ctx, {
    academicYearId: before.academicYearId,
    sectionId: before.sectionId,
    ...next,
    excludeId: id,
  });

  return ctx.withTransaction(async (repos) => {
    const updated = await repos.timetableEntries.update(id, {
      ...(input.subjectId !== undefined && { subjectId: input.subjectId }),
      ...(input.teacherId !== undefined && { teacherId: input.teacherId }),
      ...(input.periodId !== undefined && { periodId: input.periodId }),
      ...(input.weekday !== undefined && { weekday: next.weekday }),
      ...(input.room !== undefined && { room: input.room }),
    });
    await repos.audit.record({
      schoolId: ctx.user.schoolId,
      actorUserId: ctx.user.userId,
      action: "TIMETABLE_ENTRY_UPDATE",
      entityType: "TimetableEntry",
      entityId: updated.id,
      before: auditShape(before),
      after: auditShape(updated),
    });
    return enrichEntry(ctx, updated);
  });
}

/** Delete a timetable entry. Admin-only, audited. */
export async function deleteTimetableEntry(ctx: ServiceContext, id: string): Promise<void> {
  assertCan(ctx.user, PERMISSIONS.TIMETABLE_MANAGE);
  const before = await loadEntryInSchool(ctx, id);
  await ctx.withTransaction(async (repos) => {
    await repos.timetableEntries.delete(id);
    await repos.audit.record({
      schoolId: ctx.user.schoolId,
      actorUserId: ctx.user.userId,
      action: "TIMETABLE_ENTRY_DELETE",
      entityType: "TimetableEntry",
      entityId: id,
      before: auditShape(before),
    });
  });
}

/* ---- reads (enriched; ADR-017 §3 row scope) ---- */

/** A section's weekly grid. Admin → any; parent → own child's section only. */
export async function getSectionTimetable(
  ctx: ServiceContext,
  academicYearId: string,
  sectionId: string,
): Promise<TimetableEntryDto[]> {
  assertCan(ctx.user, PERMISSIONS.TIMETABLE_READ);
  await assertSectionReadScope(ctx, academicYearId, sectionId);
  const rows = await ctx.repositories.timetableEntries.listBySection(academicYearId, sectionId);
  return enrichEntries(ctx, rows);
}

/**
 * A teacher's weekly grid (their OWN slots). Admin → any teacherId; teacher → only
 * self (a passed teacherId must equal the caller — ADR-017 §3, own-slots only).
 */
export async function getTeacherTimetable(
  ctx: ServiceContext,
  academicYearId: string,
  teacherId: string,
): Promise<TimetableEntryDto[]> {
  assertCan(ctx.user, PERMISSIONS.TIMETABLE_READ);
  if (!isFullAccess(ctx) && teacherId !== ctx.user.userId) {
    throw new ValidationError("Teachers may only read their own timetable");
  }
  const rows = await ctx.repositories.timetableEntries.listByTeacher(academicYearId, teacherId);
  return enrichEntries(ctx, rows);
}

/**
 * A parent's timetable — the weekly grids of every section one of their children is
 * ACTIVE in this year. Parent-only (admins use the section/teacher views).
 */
export async function getParentTimetable(
  ctx: ServiceContext,
  academicYearId: string,
): Promise<TimetableEntryDto[]> {
  assertCan(ctx.user, PERMISSIONS.TIMETABLE_READ);
  const sectionIds = await parentSectionIds(ctx, academicYearId);
  const perSection = await Promise.all(
    sectionIds.map((sid) => ctx.repositories.timetableEntries.listBySection(academicYearId, sid)),
  );
  return enrichEntries(ctx, perSection.flat());
}

/**
 * Today's timetable (IST weekday), role-branched: teacher → own slots today;
 * parent → child's section(s) today. Admins should use the section/teacher views.
 */
export async function getTodayTimetable(
  ctx: ServiceContext,
  academicYearId: string,
): Promise<TimetableEntryDto[]> {
  assertCan(ctx.user, PERMISSIONS.TIMETABLE_READ);
  const today = istWeekday(new Date());
  let rows: TimetableEntry[];
  if (ctx.user.role === "PARENT") {
    const sectionIds = await parentSectionIds(ctx, academicYearId);
    const perSection = await Promise.all(
      sectionIds.map((sid) => ctx.repositories.timetableEntries.listBySection(academicYearId, sid)),
    );
    rows = perSection.flat();
  } else {
    rows = await ctx.repositories.timetableEntries.listByTeacher(academicYearId, ctx.user.userId);
  }
  return enrichEntries(
    ctx,
    rows.filter((r) => r.weekday === today),
  );
}

/* ---- helpers ---- */

async function parentSectionIds(ctx: ServiceContext, academicYearId: string): Promise<string[]> {
  const enrollments = await parentActiveEnrollmentsInYear(ctx, academicYearId);
  return [...new Set(enrollments.map((e) => e.sectionId).filter((s): s is string => !!s))];
}

interface SlotValidation {
  academicYearId: string;
  sectionId: string;
  subjectId: string;
  teacherId: string;
  periodId: string;
  weekday: Weekday;
  excludeId: string | null;
}

/**
 * The full set of entry invariants (ADR-017 §2): all refs in-school; the period
 * belongs to THIS year's bell schedule (cross-year integrity); the period is not a
 * break; the teacher is assigned to this subject×section (derived ownership); and
 * neither the section nor the teacher is already booked in this (weekday, period)
 * slot (the two DB uniques, pre-checked here excluding the row being edited).
 */
async function validateSlot(ctx: ServiceContext, v: SlotValidation): Promise<void> {
  await assertYearInSchool(ctx, v.academicYearId);
  await assertSectionInSchool(ctx, v.sectionId);
  await assertSubjectInSchool(ctx, v.subjectId);

  const period = await loadPeriodInSchool(ctx, v.periodId);
  const schedule = await ctx.repositories.bellSchedules.findById(period.bellScheduleId);
  if (!schedule || schedule.academicYearId !== v.academicYearId) {
    throw new ValidationError("Period does not belong to this year's bell schedule");
  }
  if (period.isBreak) {
    throw new ValidationError("Cannot schedule a class on a break period");
  }

  await assertTeacherAssignedToSubjectSection(ctx, v.teacherId, v.subjectId, v.sectionId);

  const sectionSlot = await ctx.repositories.timetableEntries.findBySectionSlot(
    v.sectionId,
    v.weekday,
    v.periodId,
  );
  if (sectionSlot && sectionSlot.id !== v.excludeId) {
    throw new ConflictError("This section already has a class in this period on this day");
  }
  const teacherSlot = await ctx.repositories.timetableEntries.findByTeacherSlot(
    v.teacherId,
    v.weekday,
    v.periodId,
  );
  if (teacherSlot && teacherSlot.id !== v.excludeId) {
    throw new ConflictError("This teacher already has a class in this period on this day");
  }
}

function auditShape(e: TimetableEntry) {
  return {
    sectionId: e.sectionId,
    subjectId: e.subjectId,
    teacherId: e.teacherId,
    periodId: e.periodId,
    weekday: e.weekday,
    room: e.room,
  };
}
