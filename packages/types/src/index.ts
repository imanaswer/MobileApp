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

/** M6.5: the current class teacher of a section for a year (ADR-015). */
export interface ClassTeacherAssignmentDto {
  id: string;
  schoolId: string;
  academicYearId: string;
  sectionId: string;
  teacherId: string;
  /** ISO timestamp — when the CURRENT teacher took the slot (re-stamped on replace). */
  assignedAt: string;
  /** Staff id of the acting admin who assigned/replaced (audit actor). */
  createdByStaffId: string;
  /** Display name of the assigned teacher (Staff.name via teacherId→userId; ADR-016). */
  teacherName: string;
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

/** A section-roster row enriched with the student's display name (M8, ADR-016; sectionRoster). */
export interface EnrollmentRosterRowDto extends EnrollmentDto {
  studentName: string;
}

/**
 * An enrollment-history row enriched with class/section display names (M8, ADR-016;
 * enrollment.listByStudent). The label join happens INSIDE the parent-scoped enrollment
 * read (via repositories, not the academic service) — so parents get labels without `academic:read`.
 */
export interface EnrollmentHistoryRowDto extends EnrollmentDto {
  className: string;
  sectionName: string | null;
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
  name: string;
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

/* ---------- Homework & Assignment Management (M6, ADR-013) ---------- */
export type HomeworkStatusKey = "DRAFT" | "PUBLISHED" | "CLOSED";
export type SubmissionStatusKey = "SUBMITTED" | "RETURNED" | "REVIEWED";

export interface HomeworkDto {
  id: string;
  schoolId: string;
  academicYearId: string;
  subjectId: string;
  sectionId: string;
  title: string;
  description: string | null;
  dueDate: IstDateString;
  status: HomeworkStatusKey;
  createdByStaffId: string;
  publishedByStaffId: string | null;
  publishedAt: IsoUtcString | null;
  closedByStaffId: string | null;
  closedAt: IsoUtcString | null;
  reopenedByStaffId: string | null;
  reopenedAt: IsoUtcString | null;
  reopenReason: string | null;
}

/** A teacher's assignable (subject × section) target — name-enriched, for the create picker + list labels. */
export interface HomeworkTargetDto {
  subjectId: string;
  subjectName: string;
  sectionId: string;
  sectionName: string;
}

/* ---------- Report Cards & Academic Results (M7, ADR-014) ---------- */
export type ReportCardKindKey = "EXAM" | "TERM" | "ANNUAL";
export type ReportCardStatusKey =
  "DRAFT" | "SUBMITTED" | "APPROVED" | "PUBLISHED" | "SUPERSEDED" | "REVOKED";
export type RankScopeKey = "SECTION" | "CLASS";
export type PromotionDecisionKey = "PROMOTED" | "RETAINED";

/**
 * A report card (M7, ADR-014). Owner = Enrollment; Exam/Term are scope. All snapshot
 * fields are null in DRAFT/SUBMITTED and frozen at APPROVE. Dates are ISO-UTC (rendered
 * to IST at the edge). pdfPath is a private-bucket path, signed on read — never a URL.
 */
export interface ReportCardDto {
  id: string;
  schoolId: string;
  enrollmentId: string;
  kind: ReportCardKindKey;
  examId: string | null;
  termId: string | null;
  version: number;
  status: ReportCardStatusKey;
  classTeacherRemark: string | null;
  principalRemark: string | null;
  promotionDecision: PromotionDecisionKey | null;
  // read-populated display labels (joined at read time via repositories; NULL on mutation
  // returns — ADR-016). examName/termName are null iff the corresponding scope id is null;
  // classTeacherName resolves the remark author (submittedByStaffId → Staff.name).
  examName: string | null;
  termName: string | null;
  classTeacherName: string | null;
  // snapshot (frozen at approve) — rank is all-or-nothing (null unless GPA computable)
  rank: number | null;
  rankScope: RankScopeKey | null;
  cohortSize: number | null;
  attendancePercentage: number | null;
  presentCount: number | null;
  absentCount: number | null;
  lateCount: number | null;
  halfDayCount: number | null;
  leaveCount: number | null;
  workingDays: number | null;
  gpaSnapshot: number | null;
  cgpaSnapshot: number | null;
  pdfPath: string | null;
  // lifecycle actors + stamps
  createdByStaffId: string;
  submittedByStaffId: string | null;
  submittedAt: IsoUtcString | null;
  approvedByStaffId: string | null;
  approvedAt: IsoUtcString | null;
  publishedByStaffId: string | null;
  publishedAt: IsoUtcString | null;
  reopenedByStaffId: string | null;
  reopenedAt: IsoUtcString | null;
  reopenReason: string | null;
  revokedByStaffId: string | null;
  revokedAt: IsoUtcString | null;
  revokeReason: string | null;
}

/** A report card enriched for the section console — carries the student's name + roll (M8; listForSection). */
export interface SectionReportCardRowDto extends ReportCardDto {
  studentName: string;
  rollNo: number | null;
}

/**
 * A parent's per-child submission context for one homework (mobile submit flow):
 * the child, the enrollment to submit against (null if they hold no ACTIVE
 * enrollment in the homework's section — e.g. after a transfer), and their existing
 * submission if any (readable across enrollments — the §10 or-clause).
 */
export interface HomeworkChildContextDto {
  studentId: string;
  studentName: string;
  enrollmentId: string | null;
  submission: HomeworkSubmissionDto | null;
}

/** Teacher-side file metadata (bytes in the private bucket, read via a signed URL). */
export interface HomeworkAttachmentDto {
  id: string;
  schoolId: string;
  homeworkId: string;
  storagePath: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  checksum: string | null;
  uploadedByStaffId: string;
  createdAt: IsoUtcString;
}

export interface HomeworkSubmissionDto {
  id: string;
  schoolId: string;
  homeworkId: string;
  enrollmentId: string;
  submittedByParentId: string;
  note: string | null;
  status: SubmissionStatusKey;
  attempt: number;
  isLate: boolean;
  firstSubmittedAt: IsoUtcString;
  submittedAt: IsoUtcString;
  reviewedByStaffId: string | null;
  reviewedAt: IsoUtcString | null;
}

/** Parent-side file metadata, append-only + tagged with the attempt it belongs to. */
export interface SubmissionAttachmentDto {
  id: string;
  schoolId: string;
  submissionId: string;
  attempt: number;
  storagePath: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  checksum: string | null;
  uploadedByParentId: string;
  createdAt: IsoUtcString;
}

/** One immutable teacher review round (text only — no grading, ADR-013 §8). */
export interface HomeworkFeedbackDto {
  id: string;
  schoolId: string;
  submissionId: string;
  authorStaffId: string;
  attempt: number;
  decision: SubmissionStatusKey;
  body: string;
  createdAt: IsoUtcString;
}
