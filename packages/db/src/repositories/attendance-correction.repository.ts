import type { AttendanceCorrection, AttendanceStatus, CorrectionStatus } from "@prisma/client";

import type { DbClient } from "../db-client";

export type { AttendanceCorrection, CorrectionStatus };

export interface CreateAttendanceCorrectionInput {
  schoolId: string;
  attendanceRecordId: string;
  requestedByStaffId: string;
  previousStatus: AttendanceStatus;
  requestedStatus: AttendanceStatus;
  reason: string;
}

export interface DecideAttendanceCorrectionInput {
  status: CorrectionStatus;
  decidedByStaffId: string;
  decidedAt: Date;
}

/** Persistence for `AttendanceCorrection` (ADR-003, ADR-011). Request payload is
 *  immutable; only the decision fields transition. No authorization/rules here. */
export interface AttendanceCorrectionRepository {
  findById(id: string): Promise<AttendanceCorrection | null>;
  listByRecord(attendanceRecordId: string): Promise<AttendanceCorrection[]>;
  listPending(schoolId: string): Promise<AttendanceCorrection[]>;
  /** Corrections raised by a given staff member (their own submissions). */
  listByRequester(requestedByStaffId: string): Promise<AttendanceCorrection[]>;
  create(input: CreateAttendanceCorrectionInput): Promise<AttendanceCorrection>;
  /**
   * Guarded decision: applies only if the row is still PENDING (conditional
   * UPDATE with a row lock). Returns the decided row, or `null` when another
   * approver already decided — so concurrent approvals can't double-apply the
   * record change or double-audit.
   */
  decide(id: string, data: DecideAttendanceCorrectionInput): Promise<AttendanceCorrection | null>;
}

export function createAttendanceCorrectionRepository(
  client: DbClient,
): AttendanceCorrectionRepository {
  return {
    findById: (id) => client.attendanceCorrection.findUnique({ where: { id } }),
    listByRecord: (attendanceRecordId) =>
      client.attendanceCorrection.findMany({
        where: { attendanceRecordId },
        orderBy: { createdAt: "desc" },
      }),
    listPending: (schoolId) =>
      client.attendanceCorrection.findMany({
        where: { schoolId, status: "PENDING" },
        orderBy: { createdAt: "asc" },
      }),
    listByRequester: (requestedByStaffId) =>
      client.attendanceCorrection.findMany({
        where: { requestedByStaffId },
        orderBy: { createdAt: "desc" },
      }),
    create: (input) => client.attendanceCorrection.create({ data: input }),
    decide: async (id, data) => {
      const { count } = await client.attendanceCorrection.updateMany({
        where: { id, status: "PENDING" },
        data: {
          status: data.status,
          decidedByStaffId: data.decidedByStaffId,
          decidedAt: data.decidedAt,
        },
      });
      return count === 0 ? null : client.attendanceCorrection.findUnique({ where: { id } });
    },
  };
}
