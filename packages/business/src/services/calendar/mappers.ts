import type { SchoolCalendarEvent } from "@repo/db";
import type { CalendarEventDto, IsoUtcString } from "@repo/types";

const iso = (d: Date): IsoUtcString => d.toISOString() as IsoUtcString;
/** @db.Date → YYYY-MM-DD (arrives as a UTC-midnight Date; the house convention). */
const dateStr = (d: Date): string => d.toISOString().slice(0, 10);

export function mapCalendarEvent(e: SchoolCalendarEvent): CalendarEventDto {
  return {
    id: e.id,
    schoolId: e.schoolId,
    academicYearId: e.academicYearId,
    title: e.title,
    description: e.description,
    eventType: e.eventType,
    startDate: dateStr(e.startDate),
    endDate: dateStr(e.endDate),
    isAllDay: e.isAllDay,
    createdByStaffId: e.createdByStaffId,
    createdAt: iso(e.createdAt),
    updatedAt: iso(e.updatedAt),
  };
}
