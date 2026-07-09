/**
 * @repo/types — framework-agnostic shared TypeScript types & DTO envelopes.
 * No runtime code. See docs/CODING_STANDARDS.md §1 and API_CONVENTIONS.md §8.
 */
import type { LocaleCode, RoleKey, UserStatusKey } from "@repo/constants";

/** Nominal/branded primitive, e.g. `type StudentId = Brand<string, "StudentId">`. */
export type Brand<T, B extends string> = T & { readonly __brand: B };

/** An ISO-8601 timestamp string in UTC (rendered to IST at the edge). */
export type IsoUtcString = Brand<string, "IsoUtcString">;

/** A YYYY-MM-DD IST calendar date string. */
export type IstDateString = Brand<string, "IstDateString">;

/** A value that may be absent. */
export type Maybe<T> = T | null | undefined;

/** Cursor-paginated result envelope (default — API_CONVENTIONS.md §8). */
export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

/** Offset-paginated result envelope (bounded admin lists only). */
export interface OffsetPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Public user-profile DTO returned by the API (never the raw DB row). */
export interface UserProfile {
  userId: string;
  role: RoleKey;
  status: UserStatusKey;
  locale: LocaleCode;
  email: string | null;
  phone: string | null;
}

/* ---- Academic structure DTOs (M2). Calendar columns are @db.Date → IST date
 * strings (YYYY-MM-DD); timestamps are UTC ISO strings (rendered to IST at edge). */

export type AcademicYearStatusKey = "PLANNED" | "ACTIVE" | "CLOSED";

export interface AcademicYearDto {
  id: string;
  schoolId: string;
  name: string;
  startDate: IstDateString;
  endDate: IstDateString;
  status: AcademicYearStatusKey;
}

export interface AcademicTermDto {
  id: string;
  academicYearId: string;
  name: string;
  startDate: IstDateString;
  endDate: IstDateString;
}

export interface ClassDto {
  id: string;
  schoolId: string;
  name: string;
  sortOrder: number;
}

export interface SectionDto {
  id: string;
  classId: string;
  name: string;
}

export interface SubjectDto {
  id: string;
  schoolId: string;
  name: string;
}

export interface TeacherAssignmentDto {
  id: string;
  schoolId: string;
  teacherId: string;
  subjectId: string;
  sectionId: string;
}

/* ---- People Management DTOs (M3). Student is identity-only; Enrollment owns
 * per-year placement (ADR-010). Calendar columns (dob, joiningDate) are IST date
 * strings. */

export type GenderKey = "MALE" | "FEMALE" | "OTHER";
export type StudentStatusKey = "ACTIVE" | "ARCHIVED" | "GRADUATED" | "WITHDRAWN";
export type StudentRelationshipKey = "FATHER" | "MOTHER" | "GUARDIAN" | "EMERGENCY_CONTACT";
export type PreferredContactKey = "PHONE" | "EMAIL" | "WHATSAPP";
export type StudentDocumentTypeKey =
  | "BIRTH_CERTIFICATE"
  | "PASSPORT"
  | "AADHAAR"
  | "MEDICAL_RECORD"
  | "TRANSFER_CERTIFICATE"
  | "PHOTO"
  | "OTHER";
export type EnrollmentStatusKey =
  "ADMITTED" | "ACTIVE" | "PROMOTED" | "RETAINED" | "TRANSFERRED" | "DROPPED" | "ALUMNI";

export interface StudentDto {
  id: string;
  schoolId: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  dob: IstDateString | null;
  gender: GenderKey | null;
  bloodGroup: string | null;
  nationality: string | null;
  aadhaar: string | null;
  passport: string | null;
  address: string | null;
  photoPath: string | null;
  status: StudentStatusKey;
}

export interface EnrollmentDto {
  id: string;
  schoolId: string;
  studentId: string;
  academicYearId: string;
  classId: string;
  sectionId: string | null;
  rollNo: number | null;
  status: EnrollmentStatusKey;
}

export interface ParentDto {
  id: string;
  schoolId: string;
  userId: string | null;
  name: string;
  phone: string;
  email: string | null;
  occupation: string | null;
  address: string | null;
  preferredContact: PreferredContactKey;
}

export interface StudentParentDto {
  studentId: string;
  parentId: string;
  relationship: StudentRelationshipKey;
  isPrimary: boolean;
}

export interface StaffDto {
  id: string;
  schoolId: string;
  userId: string;
  employeeId: string;
  department: string | null;
  qualification: string | null;
  experienceYears: number | null;
  joiningDate: IstDateString | null;
  bio: string | null;
  photoPath: string | null;
}

export interface StudentDocumentDto {
  id: string;
  schoolId: string;
  studentId: string;
  type: StudentDocumentTypeKey;
  storagePath: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  checksum: string | null;
  version: number;
  uploadedByUserId: string;
  uploadedAt: IsoUtcString;
}

/* ---- Attendance Management (M4 — ADR-011) ---- */

export type AttendanceSessionTypeKey = "DAILY" | "SUBJECT";
export type AttendanceSessionStatusKey = "DRAFT" | "SUBMITTED" | "LOCKED";
export type AttendanceStatusKey = "PRESENT" | "ABSENT" | "LATE" | "HALF_DAY" | "LEAVE";
export type LeaveStatusKey = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
export type CorrectionStatusKey = "PENDING" | "APPROVED" | "REJECTED";
export type HolidayTypeKey = "NATIONAL" | "SCHOOL" | "FESTIVAL" | "EMERGENCY_CLOSURE";

export interface AttendanceSessionDto {
  id: string;
  schoolId: string;
  academicYearId: string;
  sectionId: string;
  subjectId: string | null;
  sessionType: AttendanceSessionTypeKey;
  date: IstDateString;
  status: AttendanceSessionStatusKey;
  createdByStaffId: string;
  submittedByStaffId: string | null;
  lockedByStaffId: string | null;
  submittedAt: IsoUtcString | null;
  lockedAt: IsoUtcString | null;
}

export interface AttendanceRecordDto {
  id: string;
  schoolId: string;
  sessionId: string;
  enrollmentId: string;
  date: IstDateString; // the session's date, denormalized for history/calendar reads
  status: AttendanceStatusKey;
  remarks: string | null;
}

/** A roster row for a marking screen: the enrollment, any existing mark, and the
 *  leave-derived suggested default (ADR-011 §7 — never an eager write). */
export interface AttendanceRosterRowDto {
  enrollmentId: string;
  studentId: string;
  rollNo: number | null;
  currentStatus: AttendanceStatusKey | null;
  suggestedStatus: AttendanceStatusKey;
}

export interface LeaveRequestDto {
  id: string;
  schoolId: string;
  enrollmentId: string;
  parentId: string;
  fromDate: IstDateString;
  toDate: IstDateString;
  reason: string;
  status: LeaveStatusKey;
  decidedByStaffId: string | null;
  decidedAt: IsoUtcString | null;
}

export interface AttendanceCorrectionDto {
  id: string;
  schoolId: string;
  attendanceRecordId: string;
  requestedByStaffId: string;
  previousStatus: AttendanceStatusKey;
  requestedStatus: AttendanceStatusKey;
  reason: string;
  status: CorrectionStatusKey;
  decidedByStaffId: string | null;
  decidedAt: IsoUtcString | null;
}

/** A pending leave, enriched with the child's name for the admin approval queue. */
export interface PendingLeaveDto extends LeaveRequestDto {
  studentName: string;
}

/** A pending correction, enriched with student name + the record's date, for the queue. */
export interface PendingCorrectionDto extends AttendanceCorrectionDto {
  studentName: string;
  date: IstDateString;
}

export interface HolidayDto {
  id: string;
  schoolId: string;
  academicYearId: string;
  name: string;
  date: IstDateString;
  type: HolidayTypeKey;
}

/** Compute-on-read attendance % for an enrollment over a date range (ADR-011 §10).
 *  Weighting: PRESENT/LATE = 1, HALF_DAY = 0.5, ABSENT = 0; LEAVE excluded from
 *  the denominator. `percentage` is null when there are no countable days. */
export interface AttendanceSummaryDto {
  enrollmentId: string;
  from: IstDateString;
  to: IstDateString;
  present: number;
  absent: number;
  late: number;
  halfDay: number;
  leave: number;
  countableDays: number;
  percentage: number | null;
}

/* ---------- Examination & Assessment (M5, ADR-012) ---------- */
export type ExamTypeKey =
  | "UNIT_TEST"
  | "MONTHLY"
  | "MID_TERM"
  | "HALF_YEARLY"
  | "MODEL"
  | "ANNUAL"
  | "PRACTICAL"
  | "CUSTOM";
export type ExamSectionStatusKey = "DRAFT" | "SUBMITTED" | "LOCKED";

export interface ExamDto {
  id: string;
  schoolId: string;
  academicYearId: string;
  gradeScaleId: string | null;
  name: string;
  type: ExamTypeKey;
  displayOrder: number;
  startDate: IstDateString | null;
  endDate: IstDateString | null;
  isPublished: boolean;
  publishedAt: IsoUtcString | null;
  publishedByStaffId: string | null;
}

export interface AssessmentDto {
  id: string;
  schoolId: string;
  examId: string;
  subjectId: string;
  maxTheory: number;
  maxPractical: number | null;
  passMark: number;
  displayOrder: number;
}

export interface ExamSectionDto {
  id: string;
  schoolId: string;
  assessmentId: string;
  sectionId: string;
  status: ExamSectionStatusKey;
  createdByStaffId: string;
  submittedByStaffId: string | null;
  lockedByStaffId: string | null;
  submittedAt: IsoUtcString | null;
  lockedAt: IsoUtcString | null;
  unlockedByStaffId: string | null;
  unlockedAt: IsoUtcString | null;
  unlockReason: string | null;
}

/** A mark + its frozen result snapshot (null until the register is LOCKED). */
export interface MarkDto {
  id: string;
  schoolId: string;
  examSectionId: string;
  assessmentId: string;
  enrollmentId: string;
  theoryObtained: number | null;
  practicalObtained: number | null;
  isAbsent: boolean;
  totalObtained: number | null;
  percentage: number | null;
  gradeBandId: string | null;
  gradeLetter: string | null;
  gradePoint: number | null;
  // Enriched on the enrollment (parent) read so a client that can't read the
  // admin-gated exam/subject catalogs can still label rows; null on register reads.
  subjectName: string | null;
  examName: string | null;
}

/** A teacher's markable (assessment × section) target for the active year. */
export interface MarkableAssessmentDto {
  assessmentId: string;
  examId: string;
  examName: string;
  subjectId: string;
  subjectName: string;
  sectionId: string;
  sectionName: string;
  maxTheory: number;
  maxPractical: number | null;
  registerStatus: ExamSectionStatusKey | "NONE";
  examSectionId: string | null; // the register id once it exists (resume + submit)
}

/**
 * One register (ExamSection) under an exam, name-enriched for the admin
 * oversight/publish view. Admins can't reach a teacher's `markable` list (no
 * TeacherAssignment), so this enumerates the registers that actually exist for an
 * exam with their status — the lock/unlock surface + the publish locked-vs-total
 * count (ADR-012 R3).
 */
export interface ExamRegisterDto {
  examSectionId: string;
  assessmentId: string;
  subjectId: string;
  subjectName: string;
  sectionId: string;
  sectionName: string;
  status: ExamSectionStatusKey;
}

export interface GradeBandDto {
  id: string;
  grade: string;
  minPercent: number;
  maxPercent: number;
  gradePoint: number | null;
}

export interface GradeScaleDto {
  id: string;
  schoolId: string;
  name: string;
  isDefault: boolean;
  bands: GradeBandDto[];
}
