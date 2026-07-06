import { PERMISSIONS } from "@repo/constants";
import { ConflictError, NotFoundError, ValidationError } from "@repo/core";
import type { Holiday } from "@repo/db";
import type { HolidayDto, HolidayTypeKey } from "@repo/types";

import { assertCan } from "../../authorization";
import type { ServiceContext } from "../../context";

import { mapHoliday } from "./mappers";
import {
  formatIstDate,
  loadYearInSchool,
  parseIstDate,
  recordAudit,
  requireActiveYear,
} from "./scope";

export interface CreateHolidayInput {
  /** Defaults to the ACTIVE year. */
  academicYearId?: string | undefined;
  /** YYYY-MM-DD IST calendar date. */
  date: string;
  name: string;
  type: HolidayTypeKey;
}

export interface UpdateHolidayInput {
  name?: string | undefined;
  type?: HolidayTypeKey | undefined;
}

/** The year's holiday calendar (every portal role renders it). */
export async function listHolidays(
  ctx: ServiceContext,
  academicYearId?: string,
): Promise<HolidayDto[]> {
  assertCan(ctx.user, PERMISSIONS.HOLIDAY_READ);
  const year = academicYearId
    ? await loadYearInSchool(ctx, academicYearId)
    : await requireActiveYear(ctx);
  const rows = await ctx.repositories.holidays.listByYear(year.id);
  return rows.map(mapHoliday);
}

/**
 * Add a holiday (admin). The date must fall inside its year; one holiday row
 * per date per year. Sessions already marked on that date are untouched —
 * the calendar governs new marking and leave resolution, not history.
 */
export async function createHoliday(
  ctx: ServiceContext,
  input: CreateHolidayInput,
): Promise<HolidayDto> {
  assertCan(ctx.user, PERMISSIONS.HOLIDAY_MANAGE);
  const year = input.academicYearId
    ? await loadYearInSchool(ctx, input.academicYearId)
    : await requireActiveYear(ctx);
  const date = parseIstDate(input.date);
  if (date < year.startDate || date > year.endDate) {
    throw new ValidationError("Holiday date is outside that academic year");
  }
  if (await ctx.repositories.holidays.findByYearAndDate(year.id, date)) {
    throw new ConflictError("A holiday already exists on that date");
  }

  return ctx.withTransaction(async (repos) => {
    const created = await repos.holidays.create({
      schoolId: ctx.user.schoolId,
      academicYearId: year.id,
      date,
      name: input.name,
      type: input.type,
    });
    await recordAudit(ctx, repos, {
      action: "HOLIDAY_CREATE",
      entityType: "Holiday",
      entityId: created.id,
      after: { academicYearId: year.id, date: input.date, name: input.name, type: input.type },
    });
    return mapHoliday(created);
  });
}

/** Rename / retype a holiday (admin). Date changes are delete + create. */
export async function updateHoliday(
  ctx: ServiceContext,
  id: string,
  input: UpdateHolidayInput,
): Promise<HolidayDto> {
  assertCan(ctx.user, PERMISSIONS.HOLIDAY_MANAGE);
  const before = await loadHolidayInSchool(ctx, id);
  return ctx.withTransaction(async (repos) => {
    const after = await repos.holidays.update(before.id, {
      name: input.name,
      type: input.type,
    });
    await recordAudit(ctx, repos, {
      action: "HOLIDAY_UPDATE",
      entityType: "Holiday",
      entityId: before.id,
      before: { name: before.name, type: before.type },
      after: { name: after.name, type: after.type },
    });
    return mapHoliday(after);
  });
}

/** Remove a holiday (admin). */
export async function deleteHoliday(ctx: ServiceContext, id: string): Promise<void> {
  assertCan(ctx.user, PERMISSIONS.HOLIDAY_MANAGE);
  const holiday = await loadHolidayInSchool(ctx, id);
  await ctx.withTransaction(async (repos) => {
    await repos.holidays.delete(holiday.id);
    await recordAudit(ctx, repos, {
      action: "HOLIDAY_DELETE",
      entityType: "Holiday",
      entityId: holiday.id,
      before: {
        academicYearId: holiday.academicYearId,
        date: formatIstDate(holiday.date),
        name: holiday.name,
      },
    });
  });
}

/* ---- internal loaders ---- */

async function loadHolidayInSchool(ctx: ServiceContext, id: string): Promise<Holiday> {
  const holiday = await ctx.repositories.holidays.findById(id);
  if (!holiday || holiday.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Holiday not found");
  }
  return holiday;
}
