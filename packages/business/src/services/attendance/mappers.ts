import type {
  AttendanceCorrection,
  AttendanceRecord,
  AttendanceRecordWithSession,
  AttendanceSession,
  Holiday,
  LeaveRequest,
} from "@repo/db";
import type {
  AttendanceCorrectionDto,
  AttendanceRecordDto,
  AttendanceRecordWithSessionDto,
  AttendanceSessionDto,
  HolidayDto,
  IsoUtcString,
  IstDateString,
  LeaveRequestDto,
} from "@repo/types";

/** @db.Date → YYYY-MM-DD IST string. */
function toIstDate(date: Date): IstDateString {
  return date.toISOString().slice(0, 10) as IstDateString;
}

/** timestamp → UTC ISO string (rendered to IST at the edge). */
function toIso(date: Date): IsoUtcString {
  return date.toISOString() as IsoUtcString;
}

export function mapSession(r: AttendanceSession): AttendanceSessionDto {
  return {
    id: r.id,
    schoolId: r.schoolId,
    academicYearId: r.academicYearId,
    sectionId: r.sectionId,
    date: toIstDate(r.date),
    sessionType: r.sessionType,
    subjectId: r.subjectId,
    markedByUserId: r.markedByUserId,
    status: r.status,
    isHolidayOverride: r.isHolidayOverride,
  };
}

export function mapRecord(r: AttendanceRecord): AttendanceRecordDto {
  return {
    id: r.id,
    schoolId: r.schoolId,
    sessionId: r.sessionId,
    enrollmentId: r.enrollmentId,
    status: r.status,
    note: r.note,
  };
}

export function mapRecordWithSession(
  r: AttendanceRecordWithSession,
): AttendanceRecordWithSessionDto {
  return {
    ...mapRecord(r),
    date: toIstDate(r.session.date),
    sessionType: r.session.sessionType,
    sessionStatus: r.session.status,
    subjectId: r.session.subjectId,
  };
}

export function mapLeave(r: LeaveRequest): LeaveRequestDto {
  return {
    id: r.id,
    schoolId: r.schoolId,
    enrollmentId: r.enrollmentId,
    parentId: r.parentId,
    fromDate: toIstDate(r.fromDate),
    toDate: toIstDate(r.toDate),
    reason: r.reason,
    status: r.status,
    decidedByUserId: r.decidedByUserId,
    decidedAt: r.decidedAt ? toIso(r.decidedAt) : null,
    decisionNote: r.decisionNote,
    requestedAt: toIso(r.createdAt),
  };
}

export function mapCorrection(r: AttendanceCorrection): AttendanceCorrectionDto {
  return {
    id: r.id,
    schoolId: r.schoolId,
    attendanceRecordId: r.attendanceRecordId,
    requestedByUserId: r.requestedByUserId,
    fromStatus: r.fromStatus,
    toStatus: r.toStatus,
    reason: r.reason,
    status: r.status,
    decidedByUserId: r.decidedByUserId,
    decidedAt: r.decidedAt ? toIso(r.decidedAt) : null,
    decisionNote: r.decisionNote,
    requestedAt: toIso(r.createdAt),
  };
}

export function mapHoliday(r: Holiday): HolidayDto {
  return {
    id: r.id,
    schoolId: r.schoolId,
    academicYearId: r.academicYearId,
    date: toIstDate(r.date),
    name: r.name,
    type: r.type,
  };
}
