/**
 * @repo/validation — shared Zod schemas reused by tRPC inputs, RHF forms, and
 * import validation (DRY — CODING_STANDARDS.md §6, API_CONVENTIONS.md §3/§8).
 * Feature schemas land here per milestone; M0 ships reusable primitives only.
 */
import { DEFAULT_PAGE_SIZE, LOCALES, MAX_PAGE_SIZE, ROLES } from "@repo/constants";
import { z } from "zod";

export { z };

/** A CUID identifier (Prisma default id format). */
export const idSchema = z.string().min(1);

/** UI locale. */
export const localeSchema = z.enum(LOCALES);

/** Cursor pagination input (the default — API_CONVENTIONS.md §8). */
export const cursorPaginationInput = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
export type CursorPaginationInput = z.infer<typeof cursorPaginationInput>;

/** Ops audit-log export (M17, ADR-025 §9). Keyset by `before` (older-than). */
export const auditExportInput = z.object({
  limit: z.number().int().min(1).max(1000).default(200),
  before: z.coerce.date().optional(),
});
export type AuditExportInput = z.infer<typeof auditExportInput>;

/** Sort direction. */
export const sortDirSchema = z.enum(["asc", "desc"]).default("asc");

/** Role (matches the fixed ROLES set). */
export const roleSchema = z.enum(ROLES);

/* ---- auth inputs (Step 5/6 procedures) ---- */

/** `auth.updateProfile` — own non-credential fields (M1: locale). */
export const updateProfileInput = z.object({ locale: localeSchema });
export type UpdateProfileInput = z.infer<typeof updateProfileInput>;

/** `auth.setRole` — admin changes another user's role. */
export const setRoleInput = z.object({ userId: idSchema, role: roleSchema });
export type SetRoleInput = z.infer<typeof setRoleInput>;

/** A single target user id (`auth.disableUser` / `auth.enableUser`). */
export const userIdInput = z.object({ userId: idSchema });
export type UserIdInput = z.infer<typeof userIdInput>;

/* ---- academic structure inputs (M2). Cross-field rules (start<end, overlap,
 * uniqueness) live in the business services, not here — no duplicated validation. */

/** A single entity id (get/delete). */
export const idInput = z.object({ id: idSchema });
export type IdInput = z.infer<typeof idInput>;

/** Non-empty display name (trimmed). */
const nameSchema = z.string().trim().min(1).max(120);

/** IST calendar date `YYYY-MM-DD` → a UTC-midnight Date (a @db.Date column value). */
export const istDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  // Reject impossible dates BEFORE transform via round-trip: 2026-13-01 → NaN, and
  // 2026-02-30 → rolls to 03-02 so it won't round-trip. Otherwise a bad date slips past
  // start<end and 500s at the @db.Date column instead of a clean 400.
  .refine((s) => {
    const d = new Date(`${s}T00:00:00.000Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "Invalid calendar date")
  .transform((s) => new Date(`${s}T00:00:00.000Z`));

export const academicYearStatusSchema = z.enum(["PLANNED", "ACTIVE", "CLOSED"]);

export const createAcademicYearInput = z.object({
  name: nameSchema,
  startDate: istDateSchema,
  endDate: istDateSchema,
  status: academicYearStatusSchema.optional(),
});

export const updateAcademicYearInput = z.object({
  id: idSchema,
  name: nameSchema.optional(),
  startDate: istDateSchema.optional(),
  endDate: istDateSchema.optional(),
  status: academicYearStatusSchema.optional(),
});

export const createAcademicTermInput = z.object({
  academicYearId: idSchema,
  name: nameSchema,
  startDate: istDateSchema,
  endDate: istDateSchema,
});

export const updateAcademicTermInput = z.object({
  id: idSchema,
  name: nameSchema.optional(),
  startDate: istDateSchema.optional(),
  endDate: istDateSchema.optional(),
});

/** List terms of a year. */
export const academicYearIdInput = z.object({ academicYearId: idSchema });

export const createClassInput = z.object({
  name: nameSchema,
  sortOrder: z.number().int().optional(),
});

export const updateClassInput = z.object({
  id: idSchema,
  name: nameSchema.optional(),
  sortOrder: z.number().int().optional(),
});

export const createSectionInput = z.object({ classId: idSchema, name: nameSchema });
export const updateSectionInput = z.object({ id: idSchema, name: nameSchema.optional() });

/** List sections of a class. */
export const classIdInput = z.object({ classId: idSchema });

export const createSubjectInput = z.object({ name: nameSchema });
export const updateSubjectInput = z.object({ id: idSchema, name: nameSchema.optional() });

export const createTeacherAssignmentInput = z.object({
  teacherId: idSchema,
  subjectId: idSchema,
  sectionId: idSchema,
});

/** Filter teacher assignments (teacher-own scope is applied in the service). */
export const listTeacherAssignmentsInput = z.object({
  teacherId: idSchema.optional(),
  subjectId: idSchema.optional(),
  sectionId: idSchema.optional(),
});

/* ---- Class Teacher Management (M6.5, ADR-015). The (year × section) slot →
 * one teacher. Assign and Replace share a shape; Get is keyed by the slot.
 * All business rules (active-teacher, in-school, one-per-slot, replace-requires-
 * existing) live in the service, not duplicated here. */
export const assignClassTeacherInput = z.object({
  academicYearId: idSchema,
  sectionId: idSchema,
  teacherId: idSchema,
});
/** Replace has the same shape as assign (same slot, new teacher). */
export const replaceClassTeacherInput = assignClassTeacherInput;
/** Look up / target the class teacher of a section for a year. */
export const classTeacherSectionInput = z.object({
  academicYearId: idSchema,
  sectionId: idSchema,
});

/* ---- People Management inputs (M3). Cross-entity rules (uniqueness, one-per-year,
 * scope, rollNo-needs-section) live in the business services — not duplicated here. */

const genderSchema = z.enum(["MALE", "FEMALE", "OTHER"]);
const studentStatusSchema = z.enum(["ACTIVE", "ARCHIVED", "GRADUATED", "WITHDRAWN"]);
const relationshipSchema = z.enum(["FATHER", "MOTHER", "GUARDIAN", "EMERGENCY_CONTACT"]);
const preferredContactSchema = z.enum(["PHONE", "EMAIL", "WHATSAPP"]);
const documentTypeSchema = z.enum([
  "BIRTH_CERTIFICATE",
  "PASSPORT",
  "AADHAAR",
  "MEDICAL_RECORD",
  "TRANSFER_CERTIFICATE",
  "PHOTO",
  "OTHER",
]);
const shortText = (max: number) => z.string().trim().min(1).max(max);
const phoneSchema = z.string().trim().min(3).max(20);
const aadhaarSchema = z
  .string()
  .trim()
  .regex(/^\d{12}$/, "Aadhaar must be 12 digits");

/* Student */
export const createStudentInput = z.object({
  admissionNo: shortText(60),
  firstName: nameSchema,
  lastName: nameSchema,
  dob: istDateSchema.optional(),
  gender: genderSchema.optional(),
  bloodGroup: shortText(10).optional(),
  nationality: shortText(60).optional(),
  aadhaar: aadhaarSchema.optional(),
  passport: shortText(20).optional(),
  address: z.string().trim().max(500).optional(),
});
export const updateStudentInput = z.object({
  id: idSchema,
  firstName: nameSchema.optional(),
  lastName: nameSchema.optional(),
  dob: istDateSchema.nullable().optional(),
  gender: genderSchema.nullable().optional(),
  bloodGroup: shortText(10).nullable().optional(),
  nationality: shortText(60).nullable().optional(),
  aadhaar: aadhaarSchema.nullable().optional(),
  passport: shortText(20).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  status: studentStatusSchema.optional(),
});
export const listStudentsInput = z.object({
  status: studentStatusSchema.optional(),
  search: z.string().trim().min(1).max(120).optional(),
});
export const studentIdInput = z.object({ studentId: idSchema });

/* Enrollment (ADR-010) */
const rollNoSchema = z.number().int().positive();
export const enrollInput = z.object({
  studentId: idSchema,
  academicYearId: idSchema,
  classId: idSchema,
  sectionId: idSchema.optional(),
  rollNo: rollNoSchema.optional(),
});
export const transferInput = z.object({
  enrollmentId: idSchema,
  toSectionId: idSchema,
  rollNo: rollNoSchema.optional(),
});
export const promoteInput = z.object({
  enrollmentId: idSchema,
  targetAcademicYearId: idSchema,
  toClassId: idSchema,
  toSectionId: idSchema.optional(),
  rollNo: rollNoSchema.optional(),
});
export const withdrawInput = z.object({ enrollmentId: idSchema });
export const sectionRosterInput = z.object({ academicYearId: idSchema, sectionId: idSchema });

/* Parent */
export const createParentInput = z.object({
  userId: idSchema.optional(),
  name: nameSchema,
  phone: phoneSchema,
  email: z.string().trim().email().optional(),
  occupation: shortText(120).optional(),
  address: z.string().trim().max(500).optional(),
  preferredContact: preferredContactSchema.optional(),
});
export const updateParentInput = z.object({
  id: idSchema,
  userId: idSchema.nullable().optional(),
  name: nameSchema.optional(),
  phone: phoneSchema.optional(),
  email: z.string().trim().email().nullable().optional(),
  occupation: shortText(120).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  preferredContact: preferredContactSchema.optional(),
});
export const linkParentInput = z.object({
  studentId: idSchema,
  parentId: idSchema,
  relationship: relationshipSchema,
  isPrimary: z.boolean().optional(),
});

/* Bulk people import (ADR-027). ~2 MB caps the roster CSV; row-level validation
   happens in the service so failures come back as a per-row error report. */
export const importPeopleCsvInput = z.object({
  csv: z.string().min(1).max(2_000_000),
  // Validate-only pass — the UI runs this first and commits on confirmation.
  dryRun: z.boolean().optional(),
});
export const unlinkParentInput = z.object({
  studentId: idSchema,
  parentId: idSchema,
  relationship: relationshipSchema,
});

/* Staff (employment profile) */
export const createStaffInput = z.object({
  userId: idSchema,
  name: nameSchema,
  employeeId: shortText(40),
  department: shortText(120).optional(),
  qualification: shortText(200).optional(),
  experienceYears: z.number().int().min(0).max(80).optional(),
  joiningDate: istDateSchema.optional(),
  bio: z.string().trim().max(1000).optional(),
});
export const updateStaffInput = z.object({
  id: idSchema,
  name: nameSchema.optional(),
  employeeId: shortText(40).optional(),
  department: shortText(120).nullable().optional(),
  qualification: shortText(200).nullable().optional(),
  experienceYears: z.number().int().min(0).max(80).nullable().optional(),
  joiningDate: istDateSchema.nullable().optional(),
  bio: z.string().trim().max(1000).nullable().optional(),
});

/* Student documents (metadata; bytes uploaded separately to Storage) */
const documentMeta = {
  fileName: shortText(255),
  storagePath: shortText(400),
  mimeType: shortText(120).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  checksum: shortText(128).optional(),
};
export const createStudentDocumentInput = z.object({
  studentId: idSchema,
  type: documentTypeSchema,
  ...documentMeta,
});
export const replaceStudentDocumentInput = z.object({ id: idSchema, ...documentMeta });

/** Mint a one-time signed upload URL (path is namespaced server-side — ADR-004). */
export const mintDocumentUploadUrlInput = z.object({
  studentId: idSchema,
  fileName: shortText(255),
});

/* ---- Attendance Management inputs (M4, ADR-011). Business rules (holiday block,
 * duplicate register, teacher/parent scope, state-machine transitions, immutable
 * corrections) live in the services — not duplicated here. Dates transform to Date
 * at this boundary via istDateSchema, the codebase convention. */

const attendanceSessionTypeSchema = z.enum(["DAILY", "SUBJECT"]);
const attendanceStatusSchema = z.enum(["PRESENT", "ABSENT", "LATE", "HALF_DAY", "LEAVE"]);
const holidayTypeSchema = z.enum(["NATIONAL", "SCHOOL", "FESTIVAL", "EMERGENCY_CLOSURE"]);
const decisionSchema = z.enum(["APPROVED", "REJECTED"]);
const reasonSchema = z.string().trim().min(1).max(500);
const remarksSchema = z.string().trim().max(500);

/** A single session / leave / correction id. */
export const sessionIdInput = z.object({ sessionId: idSchema });
export const enrollmentIdInput = z.object({ enrollmentId: idSchema });
export const leaveIdInput = z.object({ leaveId: idSchema });

/* Attendance */
export const openSessionInput = z.object({
  academicYearId: idSchema,
  sectionId: idSchema,
  sessionType: attendanceSessionTypeSchema,
  subjectId: idSchema.optional(),
  date: istDateSchema,
});
export const markAttendanceInput = z.object({
  sessionId: idSchema,
  marks: z
    .array(
      z.object({
        enrollmentId: idSchema,
        status: attendanceStatusSchema,
        remarks: remarksSchema.optional(),
      }),
    )
    .min(1),
});
/** Look up the existing register for a section/date/type (returns it or null). */
export const findSessionInput = z.object({
  sectionId: idSchema,
  sessionType: attendanceSessionTypeSchema,
  subjectId: idSchema.optional(),
  date: istDateSchema,
});
/** Enrollment attendance history / summary over a date range. */
export const attendanceRangeInput = z.object({
  enrollmentId: idSchema,
  from: istDateSchema,
  to: istDateSchema,
});

/* Leave */
export const applyLeaveInput = z.object({
  enrollmentId: idSchema,
  fromDate: istDateSchema,
  toDate: istDateSchema,
  reason: reasonSchema,
});
export const decideLeaveInput = z.object({ leaveId: idSchema, decision: decisionSchema });

/* Attendance correction */
export const submitCorrectionInput = z.object({
  attendanceRecordId: idSchema,
  requestedStatus: attendanceStatusSchema,
  reason: reasonSchema,
});
export const decideCorrectionInput = z.object({ correctionId: idSchema, decision: decisionSchema });

/* Holiday (writes ride academic:manage; calendar reads by all roles) */
export const createHolidayInput = z.object({
  academicYearId: idSchema,
  name: nameSchema,
  date: istDateSchema,
  type: holidayTypeSchema,
});

/* ---------- Examination & Assessment (M5, ADR-012) ---------- */
export const examTypeSchema = z.enum([
  "UNIT_TEST",
  "MONTHLY",
  "MID_TERM",
  "HALF_YEARLY",
  "MODEL",
  "ANNUAL",
  "PRACTICAL",
  "CUSTOM",
]);

/** Single-id inputs. */
export const examIdInput = z.object({ examId: idSchema });
export const assessmentIdInput = z.object({ assessmentId: idSchema });
export const examSectionIdInput = z.object({ examSectionId: idSchema });

const displayOrderSchema = z.number().int().min(0);
const maxMarkSchema = z.number().int().min(0);
const obtainedSchema = z.number().min(0);

/* Exam */
export const createExamInput = z.object({
  academicYearId: idSchema,
  gradeScaleId: idSchema.optional(),
  name: nameSchema,
  type: examTypeSchema,
  displayOrder: displayOrderSchema.optional(),
  startDate: istDateSchema.optional(),
  endDate: istDateSchema.optional(),
});
export const updateExamInput = z.object({
  examId: idSchema,
  name: nameSchema.optional(),
  type: examTypeSchema.optional(),
  displayOrder: displayOrderSchema.optional(),
  gradeScaleId: idSchema.nullable().optional(),
  startDate: istDateSchema.nullable().optional(),
  endDate: istDateSchema.nullable().optional(),
});

/* Assessment */
export const createAssessmentInput = z.object({
  examId: idSchema,
  subjectId: idSchema,
  maxTheory: maxMarkSchema,
  maxPractical: maxMarkSchema.nullable().optional(),
  passMark: maxMarkSchema,
  displayOrder: displayOrderSchema.optional(),
});

/* Marks */
export const saveMarksInput = z.object({
  assessmentId: idSchema,
  sectionId: idSchema,
  marks: z
    .array(
      z.object({
        enrollmentId: idSchema,
        theoryObtained: obtainedSchema.nullable().optional(),
        practicalObtained: obtainedSchema.nullable().optional(),
        isAbsent: z.boolean().optional(),
      }),
    )
    .min(1),
});
export const unlockRegisterInput = z.object({
  examSectionId: idSchema,
  reason: z.string().trim().min(1).max(500),
});

/* Grade scale */
export const createGradeScaleInput = z.object({
  name: nameSchema,
  isDefault: z.boolean(),
  bands: z
    .array(
      z.object({
        grade: z.string().trim().min(1).max(10),
        minPercent: z.number().min(0),
        maxPercent: z.number().min(0),
        gradePoint: z.number().min(0).nullable().optional(),
      }),
    )
    .min(1),
});

/* ---------- Homework & Assignment Management (M6, ADR-013) ---------- */
/* Transport validation only — the state machine, derived ownership, §7 cross-table
 * invariants, empty-submission guard, and mime/size allow-list live in the services
 * (not duplicated here). dueDate transforms to a Date at this boundary. */

export const homeworkIdInput = z.object({ homeworkId: idSchema });
export const submissionIdInput = z.object({ submissionId: idSchema });
export const attachmentIdInput = z.object({ attachmentId: idSchema });

const homeworkTitleSchema = z.string().trim().min(1).max(200);
const homeworkBodySchema = z.string().trim().max(5000);
const submissionNoteSchema = z.string().trim().max(2000);
const feedbackBodySchema = z.string().trim().min(1).max(5000);
const reviewDecisionSchema = z.enum(["RETURNED", "REVIEWED"]);
const submissionStatusSchema = z.enum(["SUBMITTED", "RETURNED", "REVIEWED"]);

/* Homework lifecycle */
export const createHomeworkInput = z.object({
  subjectId: idSchema,
  sectionId: idSchema,
  title: homeworkTitleSchema,
  description: homeworkBodySchema.nullable().optional(),
  dueDate: istDateSchema,
});
export const updateHomeworkInput = z.object({
  homeworkId: idSchema,
  title: homeworkTitleSchema.optional(),
  description: homeworkBodySchema.nullable().optional(),
  dueDate: istDateSchema.optional(),
});
export const reopenHomeworkInput = z.object({
  homeworkId: idSchema,
  reason: reasonSchema,
});
export const listHomeworkInput = z.object({
  academicYearId: idSchema.optional(),
  sectionId: idSchema.optional(),
});

/* Teacher attachments (bytes uploaded separately to Storage — ADR-004) */
export const mintHomeworkUploadUrlInput = z.object({
  homeworkId: idSchema,
  fileName: shortText(255),
  mimeType: shortText(120),
  sizeBytes: z.number().int().positive(),
});
export const addHomeworkAttachmentInput = z.object({
  homeworkId: idSchema,
  storagePath: shortText(600),
  fileName: shortText(255),
  mimeType: shortText(120),
  sizeBytes: z.number().int().positive(),
  checksum: shortText(128).optional(),
});

/* Parent submissions */
const submissionAttachmentMetaSchema = z.object({
  storagePath: shortText(600),
  fileName: shortText(255),
  mimeType: shortText(120),
  sizeBytes: z.number().int().positive(),
  checksum: shortText(128).optional(),
});
export const submitHomeworkInput = z.object({
  homeworkId: idSchema,
  enrollmentId: idSchema,
  note: submissionNoteSchema.nullable().optional(),
  attachments: z.array(submissionAttachmentMetaSchema).max(10).default([]),
});
export const mintSubmissionUploadUrlInput = z.object({
  homeworkId: idSchema,
  enrollmentId: idSchema,
  attempt: z.number().int().positive(),
  fileName: shortText(255),
  mimeType: shortText(120),
  sizeBytes: z.number().int().positive(),
});
export const listSubmissionsInput = z.object({
  homeworkId: idSchema,
  statuses: z.array(submissionStatusSchema).nonempty().optional(),
});

/* Teacher review */
export const reviewSubmissionInput = z.object({
  submissionId: idSchema,
  decision: reviewDecisionSchema,
  body: feedbackBodySchema,
});

/* ---------- Report Cards & Academic Results (M7, ADR-014) ---------- */
const reportCardKindSchema = z.enum(["EXAM", "TERM", "ANNUAL"]);
const promotionDecisionSchema = z.enum(["PROMOTED", "RETAINED"]);
const remarkSchema = z.string().trim().min(1).max(5000);

/** {reportCardId} — submit / approve / publish / correct (bare-id lifecycle actions). */
export const reportCardIdInput = z.object({ reportCardId: idSchema });
/** Generate a DRAFT card for a (enrollment, kind, scope). examId/termId narrowed to kind in the service. */
export const generateReportCardInput = z.object({
  enrollmentId: idSchema,
  kind: reportCardKindSchema,
  examId: idSchema.optional(),
  termId: idSchema.optional(),
});
export const draftClassTeacherRemarkInput = z.object({
  reportCardId: idSchema,
  remark: remarkSchema,
});
export const editReportCardInput = z.object({
  reportCardId: idSchema,
  principalRemark: remarkSchema.nullable().optional(),
  promotionDecision: promotionDecisionSchema.nullable().optional(),
});
export const reopenReportCardInput = z.object({ reportCardId: idSchema, reason: reasonSchema });
export const revokeReportCardInput = z.object({ reportCardId: idSchema, reason: reasonSchema });

/* ---- Timetable Management inputs (M9, ADR-017). Cross-field/business rules
 * (one-schedule-per-year, period overlap, ownership from TeacherAssignment,
 * double-booking, cross-year, no-class-on-break) live in the services — not here. */

/** Clock time "HH:MM" 24-hour (a `@db.Time` column value). */
export const clockTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM (00:00–23:59)");
/** Weekday enum (Mon–Sun; matches the Prisma `Weekday`). */
export const weekdaySchema = z.enum(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]);
const roomSchema = z.string().trim().max(60);

/** {bellScheduleId} — list a schedule's periods. */
export const bellScheduleIdInput = z.object({ bellScheduleId: idSchema });

/** Create the year's (single) bell schedule. */
export const createBellScheduleInput = z.object({ academicYearId: idSchema, name: nameSchema });
/** Rename the bell schedule. */
export const updateBellScheduleInput = z.object({ id: idSchema, name: nameSchema });

/** Add a period to a schedule. */
export const createPeriodInput = z.object({
  bellScheduleId: idSchema,
  name: nameSchema,
  order: z.number().int().positive(),
  startTime: clockTimeSchema,
  endTime: clockTimeSchema,
  isBreak: z.boolean().default(false),
});
/** Edit a period (any subset). */
export const updatePeriodInput = z.object({
  id: idSchema,
  name: nameSchema.optional(),
  order: z.number().int().positive().optional(),
  startTime: clockTimeSchema.optional(),
  endTime: clockTimeSchema.optional(),
  isBreak: z.boolean().optional(),
});

/** Create a timetable entry (one weekly slot). */
export const createTimetableEntryInput = z.object({
  academicYearId: idSchema,
  sectionId: idSchema,
  subjectId: idSchema,
  teacherId: idSchema,
  periodId: idSchema,
  weekday: weekdaySchema,
  room: roomSchema.nullable().optional(),
});
/** Edit a timetable entry (any subset; section/year are fixed after create). */
export const updateTimetableEntryInput = z.object({
  id: idSchema,
  subjectId: idSchema.optional(),
  teacherId: idSchema.optional(),
  periodId: idSchema.optional(),
  weekday: weekdaySchema.optional(),
  room: roomSchema.nullable().optional(),
});

/* Reads: academicYearId is OPTIONAL (defaults to the ACTIVE year server-side — a
 * parent has no academic:read to supply one); teacherId defaults to the caller. */
/** A parent/today read (optional year override). */
export const timetableReadInput = z.object({ academicYearId: idSchema.optional() });
/** A section's weekly grid (section required; year defaults to active). */
export const sectionTimetableInput = z.object({
  academicYearId: idSchema.optional(),
  sectionId: idSchema,
});
/** A teacher's weekly grid (both optional: year → active, teacher → caller). */
export const teacherTimetableInput = z.object({
  academicYearId: idSchema.optional(),
  teacherId: idSchema.optional(),
});

/* ---- notifications (M10, ADR-018) ---- */
const notificationPrioritySchema = z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]);

/** Inbox list: live (default) or archived, keyset-paged by ISO createdAt. */
export const listNotificationsInput = z.object({
  archived: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  before: z.string().datetime().optional(),
});

/** Admin announcement: SCHOOL (all active parents+teachers) or SECTION (that section). */
export const createAnnouncementInput = z
  .object({
    scope: z.enum(["SCHOOL", "SECTION"]),
    sectionId: idSchema.optional(),
    academicYearId: idSchema.optional(),
    title: z.string().min(1).max(200),
    body: z.string().min(1).max(2000),
    priority: notificationPrioritySchema.optional(),
    actionUrl: z.string().max(500).optional(),
  })
  .refine((v) => v.scope !== "SECTION" || !!v.sectionId, {
    message: "sectionId is required for a SECTION announcement",
    path: ["sectionId"],
  });

/** Register a device for push (self-scoped; upsert on the Expo token). Phase 1, B13. */
export const registerDeviceInput = z.object({
  expoPushToken: z.string().min(1).max(200),
  platform: z.enum(["ios", "android"]),
});
export type RegisterDeviceInput = z.infer<typeof registerDeviceInput>;

/** Deregister a device (logout cleanup). */
export const deregisterDeviceInput = z.object({
  expoPushToken: z.string().min(1).max(200),
});
export type DeregisterDeviceInput = z.infer<typeof deregisterDeviceInput>;

/* ---- announcements, circulars & calendar (M11, ADR-019) ---- */
const announcementScopeSchema = z.enum(["WHOLE_SCHOOL", "CLASS", "SECTION", "TEACHERS", "PARENTS"]);
const announcementStatusSchema = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);
const calendarEventTypeSchema = z.enum(["HOLIDAY", "EVENT", "EXAM", "MEETING", "OTHER"]);

/** Validated YYYY-MM-DD string — NOT transformed to Date (the calendar service parses
 *  it and gives friendly domain errors; string ISO dates also compare lexically). */
const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  .refine((s) => {
    const d = new Date(`${s}T00:00:00.000Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "Invalid calendar date");

/** CLASS/SECTION scopes require a targetId (a Class/Section id); others must omit it. */
export const createAnnouncementDraftInput = z
  .object({
    title: z.string().min(1).max(200),
    body: z.string().min(1).max(5000),
    scope: announcementScopeSchema,
    targetId: idSchema.optional(),
    academicYearId: idSchema.optional(),
  })
  .refine((v) => !(v.scope === "SECTION" || v.scope === "CLASS") || !!v.targetId, {
    message: "targetId is required for a CLASS or SECTION announcement",
    path: ["targetId"],
  });

export const updateAnnouncementInput = z.object({
  id: idSchema,
  title: z.string().min(1).max(200).optional(),
  body: z.string().min(1).max(5000).optional(),
  scope: announcementScopeSchema.optional(),
  targetId: idSchema.nullable().optional(),
});

export const publishAnnouncementInput = z.object({
  id: idSchema,
  notify: z.boolean().optional(),
});

export const listAnnouncementsInput = z.object({
  status: announcementStatusSchema.optional(),
  limit: z.number().int().min(1).max(100).optional(),
  before: z.string().datetime().optional(),
});

export const mintAnnouncementUploadUrlInput = z.object({
  announcementId: idSchema,
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(150),
  sizeBytes: z.number().int().positive(),
});

export const addAnnouncementAttachmentInput = z.object({
  announcementId: idSchema,
  path: z.string().min(1).max(500),
  fileName: z.string().min(1).max(255),
  sizeBytes: z.number().int().positive(),
});

export const createCalendarEventInput = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(2000).nullable().optional(),
    eventType: calendarEventTypeSchema,
    startDate: calendarDateSchema,
    endDate: calendarDateSchema,
    isAllDay: z.boolean().optional(),
    academicYearId: idSchema.optional(),
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: "endDate must not be before startDate",
    path: ["endDate"],
  });

export const updateCalendarEventInput = z.object({
  id: idSchema,
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  eventType: calendarEventTypeSchema.optional(),
  startDate: calendarDateSchema.optional(),
  endDate: calendarDateSchema.optional(),
  isAllDay: z.boolean().optional(),
});

export const listCalendarRangeInput = z.object({
  from: calendarDateSchema,
  to: calendarDateSchema,
  academicYearId: idSchema.optional(),
  eventType: calendarEventTypeSchema.optional(),
});

export const listCalendarMonthInput = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  academicYearId: idSchema.optional(),
  eventType: calendarEventTypeSchema.optional(),
});

export const listUpcomingCalendarInput = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  academicYearId: idSchema.optional(),
  eventType: calendarEventTypeSchema.optional(),
});

// ---------------------------------------------------------------------------
// Student Discipline (M12, ADR-020)
// ---------------------------------------------------------------------------

const behaviourCategorySchema = z.enum([
  "DISCIPLINE",
  "BULLYING",
  "UNIFORM",
  "HOMEWORK",
  "MISCONDUCT",
  "LATE",
  "OTHER",
]);
const behaviourSeveritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const behaviourStatusSchema = z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]);

/** `teacherId` is admin-only (the referring teacher); on the teacher path the service
 *  ignores it and sets teacherId = self. */
export const createBehaviourIncidentInput = z.object({
  studentId: idSchema,
  // Admin-only pin (any year); on the teacher path the ACTIVE-year enrollment is derived.
  enrollmentId: idSchema.optional(),
  category: behaviourCategorySchema,
  severity: behaviourSeveritySchema,
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  actionTaken: z.string().max(5000).nullable().optional(),
  teacherId: idSchema.optional(),
  notify: z.boolean().optional(),
});

export const updateBehaviourIncidentInput = z.object({
  id: idSchema,
  category: behaviourCategorySchema.optional(),
  severity: behaviourSeveritySchema.optional(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(5000).optional(),
  actionTaken: z.string().max(5000).nullable().optional(),
  status: z.enum(["OPEN", "IN_PROGRESS"]).optional(),
});

export const listIncidentsInput = z.object({
  studentId: idSchema.optional(),
  teacherId: idSchema.optional(),
  status: behaviourStatusSchema.optional(),
  severity: behaviourSeveritySchema.optional(),
  limit: z.number().int().min(1).max(100).optional(),
  before: z.string().datetime().optional(),
});

export const listBehaviourByStudentInput = z.object({
  studentId: idSchema,
  limit: z.number().int().min(1).max(100).optional(),
  before: z.string().datetime().optional(),
});

export const listBehaviourByTeacherInput = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  before: z.string().datetime().optional(),
});

// ---------------------------------------------------------------------------
// Teacher ↔ Parent Messaging (M18)
// ---------------------------------------------------------------------------

/** Open (or reuse — idempotent) a 1:1 thread about a student with a counterparty
 *  (`otherUserId`): the parent, on the teacher path; the teacher, on the parent path. */
export const createThreadInput = z.object({
  studentId: idSchema,
  otherUserId: idSchema,
});

export const sendMessageInput = z.object({
  threadId: idSchema,
  body: z.string().min(1).max(4000),
});

export const listThreadsInput = z.object({
  before: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const threadMessagesInput = z.object({
  threadId: idSchema,
  before: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const markThreadReadInput = z.object({
  threadId: idSchema,
});

/* ---- Fees & Payments (M13, ADR-021). Money is in paise (Int). Cross-field money
 * invariants (paid<=total, balance, snapshot) live in the DB CHECK + business service. */

const paymentMethodSchema = z.enum(["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE", "ONLINE"]);
/** Filterable invoice statuses — OVERDUE is compute-on-read and never stored (ADR-021 §3). */
const invoiceStatusFilterSchema = z.enum(["DRAFT", "ISSUED", "PARTIAL", "PAID", "CANCELLED"]);
/** A money amount in paise (non-negative integer). */
const paiseSchema = z.number().int().min(0);

const feeComponentInput = z.object({
  name: z.string().trim().min(1).max(120),
  amount: paiseSchema,
  order: z.number().int().min(0),
  mandatory: z.boolean(),
});

export const createStructureInput = z.object({
  academicYearId: idSchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000).nullable().optional(),
  components: z.array(feeComponentInput).min(1),
});

export const updateStructureInput = z.object({
  id: idSchema,
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  active: z.boolean().optional(),
  components: z.array(feeComponentInput).min(1).optional(),
});

export const listStructuresInput = z.object({
  academicYearId: idSchema.optional(),
  active: z.boolean().optional(),
});

export const generateInvoicesInput = z.object({
  feeStructureId: idSchema,
  sectionId: idSchema,
  dueDate: istDateSchema,
  issueDate: istDateSchema.optional(),
});

export const listInvoicesInput = z.object({
  studentId: idSchema.optional(),
  enrollmentId: idSchema.optional(),
  feeStructureId: idSchema.optional(),
  status: invoiceStatusFilterSchema.optional(),
  academicYearId: idSchema.optional(),
  sectionId: idSchema.optional(),
  limit: z.number().int().min(1).max(100).optional(),
  before: z.string().datetime().optional(),
});

export const listInvoicesByStudentInput = z.object({
  studentId: idSchema,
  limit: z.number().int().min(1).max(100).optional(),
  before: z.string().datetime().optional(),
});

export const recordPaymentInput = z.object({
  invoiceId: idSchema,
  amount: z.number().int().min(1),
  method: paymentMethodSchema,
  referenceNo: z.string().max(120).nullable().optional(),
  remarks: z.string().max(2000).nullable().optional(),
  paymentDate: istDateSchema.optional(),
});

export const listPaymentsInput = z.object({
  method: paymentMethodSchema.optional(),
  from: istDateSchema.optional(),
  to: istDateSchema.optional(),
  limit: z.number().int().min(1).max(100).optional(),
  before: z.string().datetime().optional(),
});

/* ---------- analytics & reporting (M14, ADR-022) — read-only inputs ---------- */

export const sectionIdInput = z.object({ sectionId: idSchema });
export type SectionIdInput = z.infer<typeof sectionIdInput>;

export const feeCollectionInput = z.object({ academicYearId: idSchema.optional() });
export type FeeCollectionInput = z.infer<typeof feeCollectionInput>;

export const topPerformersInput = z.object({
  limit: z.number().int().min(1).max(100).optional(),
});
export type TopPerformersInput = z.infer<typeof topPerformersInput>;

/* ---------- documents, certificates & downloads (M15, ADR-023) ---------- */

// Distinct from the M3 documentTypeSchema (student KYC uploads) — issued certificates.
const certTypeSchema = z.enum([
  "BONAFIDE_CERTIFICATE",
  "STUDY_CERTIFICATE",
  "CHARACTER_CERTIFICATE",
  "TRANSFER_CERTIFICATE",
  "FEE_RECEIPT",
  "REPORT_CARD",
  "HALL_TICKET",
  "ID_CARD",
  "OTHER",
]);
const documentStatusSchema = z.enum(["GENERATED", "UPLOADED", "APPROVED", "ARCHIVED"]);

export const generateDocumentInput = z.object({
  studentId: idSchema,
  type: certTypeSchema,
  templateId: idSchema.optional(),
  fields: z.record(z.string(), z.string()).optional(),
});
export type GenerateDocumentInput = z.infer<typeof generateDocumentInput>;

export const documentUploadUrlInput = z.object({
  studentId: idSchema,
  fileName: shortText(255),
});
export type DocumentUploadUrlInput = z.infer<typeof documentUploadUrlInput>;

export const createUploadedDocumentInput = z.object({
  studentId: idSchema,
  type: certTypeSchema,
  storagePath: shortText(500),
  fileName: shortText(255),
  mimeType: z.string().max(120).optional(),
  sizeBytes: z.number().int().min(0).optional(),
});
export type CreateUploadedDocumentInput = z.infer<typeof createUploadedDocumentInput>;

export const listStudentDocumentsInput = z.object({
  studentId: idSchema,
  type: certTypeSchema.optional(),
  status: documentStatusSchema.optional(),
});
export type ListStudentDocumentsInput = z.infer<typeof listStudentDocumentsInput>;

export const listDocumentsInput = z.object({
  studentId: idSchema.optional(),
  type: certTypeSchema.optional(),
  status: documentStatusSchema.optional(),
  limit: z.number().int().min(1).max(200).optional(),
});
export type ListDocumentsInput = z.infer<typeof listDocumentsInput>;

export const createDocumentTemplateInput = z.object({
  type: certTypeSchema,
  name: shortText(120),
});
export type CreateDocumentTemplateInput = z.infer<typeof createDocumentTemplateInput>;

export const updateDocumentTemplateInput = z.object({
  id: idSchema,
  name: shortText(120).optional(),
  active: z.boolean().optional(),
});
export type UpdateDocumentTemplateInput = z.infer<typeof updateDocumentTemplateInput>;

export const listDocumentTemplatesInput = z.object({
  type: certTypeSchema.optional(),
  active: z.boolean().optional(),
});
export type ListDocumentTemplatesInput = z.infer<typeof listDocumentTemplatesInput>;

// ---- M16 School Administration & Configuration (ADR-024) ----
// Patch inputs — every field optional; `.nullish()` clears an admin-set value.

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a #RRGGBB hex colour");
const themeSchema = z.enum(["light", "dark", "system"]);

export const updateBrandingInput = z.object({
  logoPath: shortText(500).nullish(),
  primaryColor: hexColor.nullish(),
  secondaryColor: hexColor.nullish(),
  displayName: shortText(120).nullish(),
});
export type UpdateBrandingInput = z.infer<typeof updateBrandingInput>;

export const brandingLogoUploadUrlInput = z.object({ fileName: shortText(255) });
export type BrandingLogoUploadUrlInput = z.infer<typeof brandingLogoUploadUrlInput>;

export const updateSchoolSettingsInput = z.object({
  contactEmail: z.string().trim().email().max(255).nullish(),
  contactPhone: phoneSchema.nullish(),
  website: shortText(255).nullish(),
  principalName: shortText(120).nullish(),
  academicYearStartMonth: z.number().int().min(1).max(12).nullish(),
  invoicePrefix: shortText(16).nullish(),
  certificatePrefix: shortText(16).nullish(),
  academicDefaults: z.record(z.string(), z.unknown()).optional(),
});
export type UpdateSchoolSettingsInput = z.infer<typeof updateSchoolSettingsInput>;

export const updateSystemSettingsInput = z.object({
  timezone: z.string().trim().min(1).max(64).optional(),
  language: localeSchema.optional(),
  theme: themeSchema.optional(),
  workingDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
});
export type UpdateSystemSettingsInput = z.infer<typeof updateSystemSettingsInput>;
