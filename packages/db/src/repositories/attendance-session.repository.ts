import type { AttendanceSession } from "@prisma/client";

import type { DbClient } from "../db-client";

export type { AttendanceSession };

export type AttendanceSessionTypeKey = "MORNING" | "AFTERNOON" | "SUBJECT";
export type AttendanceSessionStatusKey = "OPEN" | "FINALIZED";

export interface CreateAttendanceSessionInput {
  schoolId: string;
  academicYearId: string;
  sectionId: string;
  date: Date;
  sessionType: AttendanceSessionTypeKey;
  subjectId?: string | null;
  markedByUserId: string;
  isHolidayOverride?: boolean;
}

/** Optional narrowing for list queries (row scope is applied by the service). */
export interface AttendanceSessionFilter {
  academicYearId?: string | undefined;
  sectionIds?: readonly string[] | undefined;
  dateFrom?: Date | undefined;
  dateTo?: Date | undefined;
  markedByUserId?: string | undefined;
}

/** Persistence for `AttendanceSession` (ADR-003, ADR-011). No authorization/business rules. */
export interface AttendanceSessionRepository {
  findById(id: string): Promise<AttendanceSession | null>;
  /** The would-be duplicate under the partial uniques (clean 409 before the DB). */
  findDuplicate(
    sectionId: string,
    date: Date,
    sessionType: AttendanceSessionTypeKey,
    subjectId: string | null,
  ): Promise<AttendanceSession | null>;
  list(schoolId: string, filter?: AttendanceSessionFilter): Promise<AttendanceSession[]>;
  create(input: CreateAttendanceSessionInput): Promise<AttendanceSession>;
  updateStatus(id: string, status: AttendanceSessionStatusKey): Promise<AttendanceSession>;
  /** Hard delete (admin mistake cleanup only; records must be deleted first). */
  delete(id: string): Promise<void>;
}

export function createAttendanceSessionRepository(client: DbClient): AttendanceSessionRepository {
  return {
    findById: (id) => client.attendanceSession.findUnique({ where: { id } }),
    findDuplicate: (sectionId, date, sessionType, subjectId) =>
      client.attendanceSession.findFirst({
        where: { sectionId, date, sessionType, subjectId },
      }),
    list: (schoolId, filter) =>
      client.attendanceSession.findMany({
        where: {
          schoolId,
          ...(filter?.academicYearId ? { academicYearId: filter.academicYearId } : {}),
          ...(filter?.sectionIds ? { sectionId: { in: [...filter.sectionIds] } } : {}),
          ...(filter?.markedByUserId ? { markedByUserId: filter.markedByUserId } : {}),
          ...(filter?.dateFrom || filter?.dateTo
            ? {
                date: {
                  ...(filter.dateFrom ? { gte: filter.dateFrom } : {}),
                  ...(filter.dateTo ? { lte: filter.dateTo } : {}),
                },
              }
            : {}),
        },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      }),
    create: (input) =>
      client.attendanceSession.create({
        data: {
          schoolId: input.schoolId,
          academicYearId: input.academicYearId,
          sectionId: input.sectionId,
          date: input.date,
          sessionType: input.sessionType,
          subjectId: input.subjectId ?? null,
          markedByUserId: input.markedByUserId,
          isHolidayOverride: input.isHolidayOverride ?? false,
        },
      }),
    updateStatus: (id, status) =>
      client.attendanceSession.update({ where: { id }, data: { status } }),
    delete: async (id) => {
      await client.attendanceSession.delete({ where: { id } });
    },
  };
}
