import type { AttendanceRecord, AttendanceSession } from "@prisma/client";

import type { DbClient } from "../db-client";

export type { AttendanceRecord };

export type AttendanceStatusKey = "PRESENT" | "ABSENT" | "LATE" | "HALF_DAY" | "LEAVE";

export interface CreateAttendanceRecordInput {
  schoolId: string;
  sessionId: string;
  enrollmentId: string;
  status: AttendanceStatusKey;
  note?: string | null;
}

export interface UpdateAttendanceRecordInput {
  status?: AttendanceStatusKey | undefined;
  note?: string | null | undefined;
}

/** A record joined with its session (history/date-scoped reads). */
export type AttendanceRecordWithSession = AttendanceRecord & { session: AttendanceSession };

/** Persistence for `AttendanceRecord` (ADR-003, ADR-011). No authorization/business rules. */
export interface AttendanceRecordRepository {
  findById(id: string): Promise<AttendanceRecord | null>;
  findByIdWithSession(id: string): Promise<AttendanceRecordWithSession | null>;
  listBySession(sessionId: string): Promise<AttendanceRecord[]>;
  /** An enrollment's history (optionally date-bounded), newest session first. */
  listByEnrollment(
    enrollmentId: string,
    dateFrom?: Date,
    dateTo?: Date,
  ): Promise<AttendanceRecordWithSession[]>;
  /** Records of an enrollment on specific dates (leave apply/revert). */
  listByEnrollmentOnDates(
    enrollmentId: string,
    dates: readonly Date[],
  ): Promise<AttendanceRecordWithSession[]>;
  /** Per-status counts for an enrollment (summary aggregation). */
  countByStatus(enrollmentId: string): Promise<Record<AttendanceStatusKey, number>>;
  createMany(inputs: readonly CreateAttendanceRecordInput[]): Promise<number>;
  update(id: string, data: UpdateAttendanceRecordInput): Promise<AttendanceRecord>;
  /** Hard delete of a session's records (admin mistake cleanup only). */
  deleteBySession(sessionId: string): Promise<number>;
}

export function createAttendanceRecordRepository(client: DbClient): AttendanceRecordRepository {
  return {
    findById: (id) => client.attendanceRecord.findUnique({ where: { id } }),
    findByIdWithSession: (id) =>
      client.attendanceRecord.findUnique({ where: { id }, include: { session: true } }),
    listBySession: (sessionId) =>
      client.attendanceRecord.findMany({
        where: { sessionId },
        orderBy: { createdAt: "asc" },
      }),
    listByEnrollment: (enrollmentId, dateFrom, dateTo) =>
      client.attendanceRecord.findMany({
        where: {
          enrollmentId,
          ...(dateFrom || dateTo
            ? {
                session: {
                  date: {
                    ...(dateFrom ? { gte: dateFrom } : {}),
                    ...(dateTo ? { lte: dateTo } : {}),
                  },
                },
              }
            : {}),
        },
        include: { session: true },
        orderBy: { session: { date: "desc" } },
      }),
    listByEnrollmentOnDates: (enrollmentId, dates) =>
      dates.length === 0
        ? Promise.resolve([])
        : client.attendanceRecord.findMany({
            where: { enrollmentId, session: { date: { in: [...dates] } } },
            include: { session: true },
          }),
    countByStatus: async (enrollmentId) => {
      const groups = await client.attendanceRecord.groupBy({
        by: ["status"],
        where: { enrollmentId },
        _count: { _all: true },
      });
      const counts: Record<AttendanceStatusKey, number> = {
        PRESENT: 0,
        ABSENT: 0,
        LATE: 0,
        HALF_DAY: 0,
        LEAVE: 0,
      };
      for (const g of groups) {
        counts[g.status] = g._count._all;
      }
      return counts;
    },
    createMany: async (inputs) => {
      const result = await client.attendanceRecord.createMany({
        data: inputs.map((i) => ({
          schoolId: i.schoolId,
          sessionId: i.sessionId,
          enrollmentId: i.enrollmentId,
          status: i.status,
          note: i.note ?? null,
        })),
      });
      return result.count;
    },
    update: (id, data) =>
      client.attendanceRecord.update({
        where: { id },
        data: {
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.note !== undefined ? { note: data.note } : {}),
        },
      }),
    deleteBySession: async (sessionId) => {
      const result = await client.attendanceRecord.deleteMany({ where: { sessionId } });
      return result.count;
    },
  };
}
