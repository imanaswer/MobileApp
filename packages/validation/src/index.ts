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
