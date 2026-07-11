import { PERMISSIONS } from "@repo/constants";
import { ConflictError, NotFoundError, ValidationError } from "@repo/core";
import type { CalendarEventType } from "@repo/db";
import type { CalendarEventDto } from "@repo/types";

import { assertCan } from "../../authorization";
import type { ServiceContext } from "../../context";
import { activeYearId, recordAudit } from "../people/scope";

import { mapCalendarEvent } from "./mappers";

/**
 * School calendar (M11, ADR-019): holidays / events / exams / meetings. Writes ride
 * `academic:manage` (admin — the holiday/M6.5 precedent); reads use `calendar:read`
 * (all in-scope roles). The calendar is school-wide (no per-user targeting). Every
 * mutation writes AuditLog in the same transaction. EXAM events are manual (not synced
 * from frozen M5, ADR-019 deviation #5).
 */

/** UTC-midnight Date → YYYY-MM-DD (the house convention; @db.Date has no time). */
const dateStr = (d: Date): string => d.toISOString().slice(0, 10);

/** Parse a YYYY-MM-DD calendar-date string to a UTC-midnight Date (matches @db.Date). */
function parseDate(value: string, field: string): Date {
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) {
    throw new ValidationError(`Invalid ${field}: ${value}`);
  }
  return d;
}

/** The acting user's Staff row id — the B3 actor. Admins carry a Staff row (B3). */
async function actingStaffId(ctx: ServiceContext): Promise<string> {
  const staff = await ctx.repositories.staff.findByUserId(ctx.user.userId);
  if (!staff) {
    throw new ValidationError("Acting user has no staff profile (required for calendar actions)");
  }
  return staff.id;
}

async function loadEventInSchool(ctx: ServiceContext, id: string) {
  const e = await ctx.repositories.calendarEvents.findById(id);
  if (!e || e.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Calendar event not found");
  }
  return e;
}

export interface CreateCalendarEventInput {
  title: string;
  description?: string | null | undefined;
  eventType: CalendarEventType;
  startDate: string;
  endDate: string;
  isAllDay?: boolean | undefined;
  academicYearId?: string | undefined;
}

export async function createCalendarEvent(
  ctx: ServiceContext,
  input: CreateCalendarEventInput,
): Promise<CalendarEventDto> {
  assertCan(ctx.user, PERMISSIONS.ACADEMIC_MANAGE);
  const startDate = parseDate(input.startDate, "startDate");
  const endDate = parseDate(input.endDate, "endDate");
  if (endDate < startDate) {
    throw new ValidationError("endDate must not be before startDate");
  }
  const yearId = input.academicYearId ?? (await activeYearId(ctx));
  if (!yearId) {
    throw new ConflictError("No active academic year to attach the event to");
  }
  const staffId = await actingStaffId(ctx);

  return ctx.withTransaction(async (repos) => {
    const created = await repos.calendarEvents.create({
      schoolId: ctx.user.schoolId,
      academicYearId: yearId,
      title: input.title,
      description: input.description ?? null,
      eventType: input.eventType,
      startDate,
      endDate,
      createdByStaffId: staffId,
      ...(input.isAllDay !== undefined ? { isAllDay: input.isAllDay } : {}),
    });
    await recordAudit(ctx, repos, {
      action: "CALENDAR_EVENT_CREATE",
      entityType: "SchoolCalendarEvent",
      entityId: created.id,
      after: { eventType: input.eventType, startDate: input.startDate, endDate: input.endDate },
    });
    return mapCalendarEvent(created);
  });
}

export interface UpdateCalendarEventInput {
  title?: string | undefined;
  description?: string | null | undefined;
  eventType?: CalendarEventType | undefined;
  startDate?: string | undefined;
  endDate?: string | undefined;
  isAllDay?: boolean | undefined;
}

export async function updateCalendarEvent(
  ctx: ServiceContext,
  id: string,
  input: UpdateCalendarEventInput,
): Promise<CalendarEventDto> {
  assertCan(ctx.user, PERMISSIONS.ACADEMIC_MANAGE);
  const existing = await loadEventInSchool(ctx, id);
  const startDate = input.startDate ? parseDate(input.startDate, "startDate") : existing.startDate;
  const endDate = input.endDate ? parseDate(input.endDate, "endDate") : existing.endDate;
  if (endDate < startDate) {
    throw new ValidationError("endDate must not be before startDate");
  }

  return ctx.withTransaction(async (repos) => {
    const updated = await repos.calendarEvents.update(id, {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.eventType !== undefined ? { eventType: input.eventType } : {}),
      ...(input.startDate !== undefined ? { startDate } : {}),
      ...(input.endDate !== undefined ? { endDate } : {}),
      ...(input.isAllDay !== undefined ? { isAllDay: input.isAllDay } : {}),
    });
    await recordAudit(ctx, repos, {
      action: "CALENDAR_EVENT_UPDATE",
      entityType: "SchoolCalendarEvent",
      entityId: id,
    });
    return mapCalendarEvent(updated);
  });
}

export async function deleteCalendarEvent(ctx: ServiceContext, id: string): Promise<void> {
  assertCan(ctx.user, PERMISSIONS.ACADEMIC_MANAGE);
  const existing = await loadEventInSchool(ctx, id);
  await ctx.withTransaction(async (repos) => {
    await repos.calendarEvents.delete(id);
    await recordAudit(ctx, repos, {
      action: "CALENDAR_EVENT_DELETE",
      entityType: "SchoolCalendarEvent",
      entityId: id,
      before: { eventType: existing.eventType, title: existing.title },
    });
  });
}

export async function getCalendarEvent(ctx: ServiceContext, id: string): Promise<CalendarEventDto> {
  assertCan(ctx.user, PERMISSIONS.CALENDAR_READ);
  const e = await loadEventInSchool(ctx, id);
  return mapCalendarEvent(e);
}

interface ListOpts {
  academicYearId?: string | undefined;
  eventType?: CalendarEventType | undefined;
}

/** Events overlapping [from, to] (inclusive). */
export async function listCalendarRange(
  ctx: ServiceContext,
  from: string,
  to: string,
  opts: ListOpts = {},
): Promise<CalendarEventDto[]> {
  assertCan(ctx.user, PERMISSIONS.CALENDAR_READ);
  const rows = await ctx.repositories.calendarEvents.list(ctx.user.schoolId, {
    startsOnOrBefore: parseDate(to, "to"),
    endsOnOrAfter: parseDate(from, "from"),
    ...(opts.academicYearId ? { academicYearId: opts.academicYearId } : {}),
    ...(opts.eventType ? { eventType: opts.eventType } : {}),
  });
  return rows.map(mapCalendarEvent);
}

/** Events overlapping a calendar month (1-based month). */
export async function listCalendarMonth(
  ctx: ServiceContext,
  year: number,
  month: number,
  opts: ListOpts = {},
): Promise<CalendarEventDto[]> {
  if (month < 1 || month > 12) {
    throw new ValidationError("month must be 1..12");
  }
  const first = new Date(Date.UTC(year, month - 1, 1));
  const last = new Date(Date.UTC(year, month, 0)); // day 0 of next month = last day of this
  return listCalendarRange(ctx, dateStr(first), dateStr(last), opts);
}

/** Upcoming or ongoing events (endDate >= today IST), soonest first. */
export async function listUpcomingCalendar(
  ctx: ServiceContext,
  limit = 20,
  opts: ListOpts = {},
): Promise<CalendarEventDto[]> {
  assertCan(ctx.user, PERMISSIONS.CALENDAR_READ);
  const today = parseDate(dateStr(new Date()), "today");
  const rows = await ctx.repositories.calendarEvents.list(ctx.user.schoolId, {
    endsOnOrAfter: today,
    limit: Math.min(Math.max(limit, 1), 100),
    ...(opts.academicYearId ? { academicYearId: opts.academicYearId } : {}),
    ...(opts.eventType ? { eventType: opts.eventType } : {}),
  });
  return rows.map(mapCalendarEvent);
}
