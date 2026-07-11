/**
 * Timetable Management use-cases (M9, ADR-017). Each mutation runs permission +
 * rule checks (ownership DERIVED from TeacherAssignment; conflict detection; period
 * validity), then writes the change AND its AuditLog row in one transaction
 * (ADR-007). Reads are enriched server-side with display labels (ADR-016) and carry
 * role row-scope (teacher own slots; parent own child's section). Routers (Step 6)
 * import these functions directly.
 */
export {
  getBellScheduleForYear,
  createBellSchedule,
  updateBellSchedule,
  type CreateBellScheduleInput,
} from "./bell-schedule.service";
export {
  listPeriods,
  createPeriod,
  updatePeriod,
  deletePeriod,
  type CreatePeriodInput,
  type UpdatePeriodInput,
} from "./period.service";
export {
  createTimetableEntry,
  updateTimetableEntry,
  deleteTimetableEntry,
  getSectionTimetable,
  getTeacherTimetable,
  getParentTimetable,
  getTodayTimetable,
  type CreateTimetableEntryInput,
  type UpdateTimetableEntryInput,
} from "./timetable.service";
