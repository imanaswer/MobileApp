import { APP_TIMEZONE } from "@repo/constants";
import { ValidationError } from "@repo/core";
import type { BellSchedule, Period, TimetableEntry, Weekday } from "@repo/db";
import type { BellScheduleDto, PeriodDto, TimetableEntryDto, WeekdayKey } from "@repo/types";

import type { ServiceContext } from "../../context";

/* ---- clock-time handling (@db.Time; ADR-017 §1) ----
 * Prisma returns a `@db.Time` column as a JS Date pinned to 1970-01-01 with the
 * clock time in UTC (e.g. 09:00 → 1970-01-01T09:00:00.000Z). So "HH:MM" is a plain
 * UTC slice, and parsing "HH:MM" builds the same 1970-01-01 UTC instant. */

/** A `@db.Time` Date → "HH:MM" 24-hour string. */
export function formatClock(d: Date): string {
  return d.toISOString().slice(11, 16);
}

/** "HH:MM" → the 1970-01-01 UTC Date Prisma stores for a `@db.Time` column. */
export function parseClock(hhmm: string): Date {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm)) {
    throw new ValidationError(`Invalid time "${hhmm}" — expected HH:MM (00:00–23:59)`);
  }
  return new Date(`1970-01-01T${hhmm}:00.000Z`);
}

const WEEKDAYS: readonly WeekdayKey[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const SHORT_TO_KEY: Record<string, WeekdayKey> = {
  Mon: "MON",
  Tue: "TUE",
  Wed: "WED",
  Thu: "THU",
  Fri: "FRI",
  Sat: "SAT",
  Sun: "SUN",
};

/** The IST (Asia/Kolkata) weekday for an instant — never `getDay()` (UTC drifts near midnight). */
export function istWeekday(at: Date): WeekdayKey {
  const short = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIMEZONE,
    weekday: "short",
  }).format(at);
  const key = SHORT_TO_KEY[short];
  if (!key) {
    throw new ValidationError(`Unmappable weekday "${short}"`);
  }
  return key;
}

/** Validate + narrow an arbitrary string to a `Weekday` enum value. */
export function toWeekday(value: string): Weekday {
  if (!(WEEKDAYS as readonly string[]).includes(value)) {
    throw new ValidationError(`Invalid weekday "${value}"`);
  }
  return value as Weekday;
}

export function mapBellSchedule(b: BellSchedule): BellScheduleDto {
  return { id: b.id, schoolId: b.schoolId, academicYearId: b.academicYearId, name: b.name };
}

export function mapPeriod(p: Period): PeriodDto {
  return {
    id: p.id,
    schoolId: p.schoolId,
    bellScheduleId: p.bellScheduleId,
    name: p.name,
    order: p.order,
    startTime: formatClock(p.startTime),
    endTime: formatClock(p.endTime),
    isBreak: p.isBreak,
  };
}

/** Names resolved once for a batch of entries (avoids the per-row N+1, ADR-016). */
export interface EntryLabels {
  subjectName: (id: string) => string;
  teacherName: (id: string) => string;
  sectionName: (id: string) => string;
  period: (id: string) => Period | undefined;
}

export function mapTimetableEntry(e: TimetableEntry, labels: EntryLabels): TimetableEntryDto {
  const period = labels.period(e.periodId);
  return {
    id: e.id,
    schoolId: e.schoolId,
    academicYearId: e.academicYearId,
    sectionId: e.sectionId,
    subjectId: e.subjectId,
    teacherId: e.teacherId,
    periodId: e.periodId,
    weekday: e.weekday as WeekdayKey,
    room: e.room,
    subjectName: labels.subjectName(e.subjectId),
    teacherName: labels.teacherName(e.teacherId),
    sectionName: labels.sectionName(e.sectionId),
    periodName: period?.name ?? "Unknown period",
    periodOrder: period?.order ?? 0,
    startTime: period ? formatClock(period.startTime) : "",
    endTime: period ? formatClock(period.endTime) : "",
    isBreak: period?.isBreak ?? false,
  };
}

/**
 * Resolve display labels for a batch of entries ONCE — subject/teacher/section names
 * and period timing (ADR-016 server-side join). Ids are de-duplicated so a full
 * weekly grid costs a handful of lookups, not one per row. Teacher name is
 * `Staff.name` via userId (ADR-016); a missing profile falls back to a stable string.
 */
async function buildLabels(ctx: ServiceContext, entries: TimetableEntry[]): Promise<EntryLabels> {
  const uniq = <T>(xs: T[]): T[] => [...new Set(xs)];
  const subjectIds = uniq(entries.map((e) => e.subjectId));
  const teacherIds = uniq(entries.map((e) => e.teacherId));
  const sectionIds = uniq(entries.map((e) => e.sectionId));
  const periodIds = uniq(entries.map((e) => e.periodId));

  const [subjects, staff, sections, periods] = await Promise.all([
    Promise.all(subjectIds.map((id) => ctx.repositories.subjects.findById(id))),
    Promise.all(teacherIds.map((id) => ctx.repositories.staff.findByUserId(id))),
    Promise.all(sectionIds.map((id) => ctx.repositories.sections.findById(id))),
    Promise.all(periodIds.map((id) => ctx.repositories.periods.findById(id))),
  ]);

  const subjectName = new Map(
    subjectIds.map((id, i) => [id, subjects[i]?.name ?? "Unknown subject"]),
  );
  const teacherName = new Map(teacherIds.map((id, i) => [id, staff[i]?.name ?? "Unknown teacher"]));
  const sectionName = new Map(
    sectionIds.map((id, i) => [id, sections[i]?.name ?? "Unknown section"]),
  );
  const periodById = new Map(periodIds.map((id, i) => [id, periods[i] ?? undefined]));

  return {
    subjectName: (id) => subjectName.get(id) ?? "Unknown subject",
    teacherName: (id) => teacherName.get(id) ?? "Unknown teacher",
    sectionName: (id) => sectionName.get(id) ?? "Unknown section",
    period: (id) => periodById.get(id),
  };
}

/** Enrich ONE entry (create/update return). */
export async function enrichEntry(
  ctx: ServiceContext,
  entry: TimetableEntry,
): Promise<TimetableEntryDto> {
  return mapTimetableEntry(entry, await buildLabels(ctx, [entry]));
}

/**
 * Enrich a batch of entries, sorted by (weekday, period order) for a stable grid.
 * The N+1 the ADR-016 seam avoids — one label pass, not one lookup per row.
 */
export async function enrichEntries(
  ctx: ServiceContext,
  entries: TimetableEntry[],
): Promise<TimetableEntryDto[]> {
  const labels = await buildLabels(ctx, entries);
  const order = (k: WeekdayKey): number => WEEKDAYS.indexOf(k);
  return entries
    .map((e) => mapTimetableEntry(e, labels))
    .sort((a, b) => order(a.weekday) - order(b.weekday) || a.periodOrder - b.periodOrder);
}
