/**
 * Attendance Management use-cases (M4, ADR-011). Attendance belongs to
 * Enrollment, never Student. Session-based marking: one AttendanceSession per
 * (section, date, type, subject?) owning one record per ACTIVE enrollment.
 * Every mutation runs permission → scope → rule checks, then writes the change
 * AND its AuditLog row in one transaction (ADR-007). Reads apply row-scope
 * (teacher → own-section, parent → own-child). Holidays gate marking and leave
 * resolution; LEAVE rows are written only by the leave workflow; corrections
 * are approval-gated and never overwrite history silently.
 */
export {
  createSession,
  saveRecords,
  finalizeSession,
  reopenSession,
  deleteSession,
  getSession,
  listSessions,
  enrollmentHistory,
  enrollmentSummary,
  type CreateSessionInput,
  type SaveRecordsInput,
  type ListSessionsInput,
  type EnrollmentHistoryInput,
  type SessionWithRecordsDto,
} from "./attendance.service";
export {
  submitLeave,
  approveLeave,
  rejectLeave,
  cancelLeave,
  listLeaves,
  type SubmitLeaveInput,
  type ListLeaveInput,
} from "./leave.service";
export {
  requestCorrection,
  approveCorrection,
  rejectCorrection,
  listCorrections,
  type RequestCorrectionInput,
  type ListCorrectionsInput,
} from "./correction.service";
export {
  listHolidays,
  createHoliday,
  updateHoliday,
  deleteHoliday,
  type CreateHolidayInput,
  type UpdateHolidayInput,
} from "./holiday.service";
