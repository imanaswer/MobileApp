import type { AttendanceCorrection } from "@prisma/client";

import type { DbClient } from "../db-client";

import type { AttendanceStatusKey } from "./attendance-record.repository";

export type { AttendanceCorrection };

export type AttendanceCorrectionStatusKey = "PENDING" | "APPROVED" | "REJECTED";

export interface CreateAttendanceCorrectionInput {
  schoolId: string;
  attendanceRecordId: string;
  requestedByUserId: string;
  fromStatus: AttendanceStatusKey;
  toStatus: AttendanceStatusKey;
  reason: string;
}

export interface DecideAttendanceCorrectionInput {
  status: AttendanceCorrectionStatusKey;
  decidedByUserId?: string | null | undefined;
  decidedAt?: Date | null | undefined;
  decisionNote?: string | null | undefined;
}

/** Optional narrowing for list queries (row scope is applied by the service). */
export interface AttendanceCorrectionFilter {
  status?: AttendanceCorrectionStatusKey | undefined;
  requestedByUserId?: string | undefined;
  /** Corrections whose record's session is in one of these sections (teacher scope). */
  sectionIds?: readonly string[] | undefined;
}

/** Persistence for `AttendanceCorrection` (ADR-003, ADR-011). No authorization/business rules. */
export interface AttendanceCorrectionRepository {
  findById(id: string): Promise<AttendanceCorrection | null>;
  findPendingByRecord(attendanceRecordId: string): Promise<AttendanceCorrection | null>;
  list(schoolId: string, filter?: AttendanceCorrectionFilter): Promise<AttendanceCorrection[]>;
  create(input: CreateAttendanceCorrectionInput): Promise<AttendanceCorrection>;
  decide(id: string, data: DecideAttendanceCorrectionInput): Promise<AttendanceCorrection>;
}

export function createAttendanceCorrectionRepository(
  client: DbClient,
): AttendanceCorrectionRepository {
  return {
    findById: (id) => client.attendanceCorrection.findUnique({ where: { id } }),
    findPendingByRecord: (attendanceRecordId) =>
      client.attendanceCorrection.findFirst({
        where: { attendanceRecordId, status: "PENDING" },
      }),
    list: (schoolId, filter) =>
      client.attendanceCorrection.findMany({
        where: {
          schoolId,
          ...(filter?.status ? { status: filter.status } : {}),
          ...(filter?.requestedByUserId ? { requestedByUserId: filter.requestedByUserId } : {}),
          ...(filter?.sectionIds
            ? { attendanceRecord: { session: { sectionId: { in: [...filter.sectionIds] } } } }
            : {}),
        },
        orderBy: { createdAt: "desc" },
      }),
    create: (input) => client.attendanceCorrection.create({ data: input }),
    decide: (id, data) =>
      client.attendanceCorrection.update({
        where: { id },
        data: {
          status: data.status,
          ...(data.decidedByUserId !== undefined ? { decidedByUserId: data.decidedByUserId } : {}),
          ...(data.decidedAt !== undefined ? { decidedAt: data.decidedAt } : {}),
          ...(data.decisionNote !== undefined ? { decisionNote: data.decisionNote } : {}),
        },
      }),
  };
}
