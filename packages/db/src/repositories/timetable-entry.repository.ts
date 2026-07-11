import type { TimetableEntry, Weekday } from "@prisma/client";

import type { DbClient } from "../db-client";

export type { TimetableEntry, Weekday };

export interface CreateTimetableEntryInput {
  schoolId: string;
  academicYearId: string;
  sectionId: string;
  subjectId: string;
  teacherId: string;
  periodId: string;
  weekday: Weekday;
  room: string | null;
}

export interface UpdateTimetableEntryInput {
  subjectId?: string;
  teacherId?: string;
  periodId?: string;
  weekday?: Weekday;
  room?: string | null;
}

/**
 * Persistence for `TimetableEntry` (ADR-003, ADR-017). No authorization/business
 * rules. Double-booking is a DB unique: `(sectionId, weekday, periodId)` and
 * `(teacherId, weekday, periodId)` — the service pre-checks via the `*Slot`
 * lookups for a friendly error, with the uniques as the race backstop.
 */
export interface TimetableEntryRepository {
  findById(id: string): Promise<TimetableEntry | null>;
  listBySection(academicYearId: string, sectionId: string): Promise<TimetableEntry[]>;
  listByTeacher(academicYearId: string, teacherId: string): Promise<TimetableEntry[]>;
  /** The entry occupying a section's (weekday, period) slot, or null. */
  findBySectionSlot(
    sectionId: string,
    weekday: Weekday,
    periodId: string,
  ): Promise<TimetableEntry | null>;
  /** The entry occupying a teacher's (weekday, period) slot, or null. */
  findByTeacherSlot(
    teacherId: string,
    weekday: Weekday,
    periodId: string,
  ): Promise<TimetableEntry | null>;
  /** Whether any entry references a period (delete-period guard — mirrors Subject.hasAssignments). */
  existsForPeriod(periodId: string): Promise<boolean>;
  create(input: CreateTimetableEntryInput): Promise<TimetableEntry>;
  update(id: string, input: UpdateTimetableEntryInput): Promise<TimetableEntry>;
  delete(id: string): Promise<void>;
}

export function createTimetableEntryRepository(client: DbClient): TimetableEntryRepository {
  return {
    findById: (id) => client.timetableEntry.findUnique({ where: { id } }),
    listBySection: (academicYearId, sectionId) =>
      client.timetableEntry.findMany({ where: { academicYearId, sectionId } }),
    listByTeacher: (academicYearId, teacherId) =>
      client.timetableEntry.findMany({ where: { academicYearId, teacherId } }),
    findBySectionSlot: (sectionId, weekday, periodId) =>
      client.timetableEntry.findUnique({
        where: { sectionId_weekday_periodId: { sectionId, weekday, periodId } },
      }),
    findByTeacherSlot: (teacherId, weekday, periodId) =>
      client.timetableEntry.findUnique({
        where: { teacherId_weekday_periodId: { teacherId, weekday, periodId } },
      }),
    existsForPeriod: async (periodId) =>
      (await client.timetableEntry.count({ where: { periodId } })) > 0,
    create: (input) => client.timetableEntry.create({ data: input }),
    update: (id, input) => client.timetableEntry.update({ where: { id }, data: input }),
    delete: async (id) => {
      await client.timetableEntry.delete({ where: { id } });
    },
  };
}
