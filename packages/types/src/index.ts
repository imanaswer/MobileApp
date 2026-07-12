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
  academicYearName: string;
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

/* ---- Timetable Management DTOs (M9, ADR-017). Grain: BellSchedule → Period →
 * TimetableEntry. Reads are ENRICHED server-side with display names (subject/
 * teacher/section/period) so React never resolves ids (ADR-016 seam). Clock times
 * are "HH:MM" 24-hour strings (from the `@db.Time` columns). */

export type WeekdayKey = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

/** The year's day structure — exactly one per year (ADR-017 §1). */
export interface BellScheduleDto {
  id: string;
  schoolId: string;
  academicYearId: string;
  name: string;
}

/** A numbered clock-time slot within the bell schedule. */
export interface PeriodDto {
  id: string;
  schoolId: string;
  bellScheduleId: string;
  name: string;
  order: number;
  /** "HH:MM" 24-hour (IST clock time). */
  startTime: string;
  /** "HH:MM" 24-hour (IST clock time). */
  endTime: string;
  isBreak: boolean;
}

/**
 * One weekly slot — enriched with display labels (ADR-016/§3). `subjectName`/
 * `teacherName`/`sectionName` and the period timing are joined server-side so the
 * grid renders labels, never ids.
 */
export interface TimetableEntryDto {
  id: string;
  schoolId: string;
  academicYearId: string;
  sectionId: string;
  subjectId: string;
  teacherId: string;
  periodId: string;
  weekday: WeekdayKey;
  room: string | null;
  // ---- enriched (server-side joins) ----
  subjectName: string;
  teacherName: string;
  sectionName: string;
  periodName: string;
  periodOrder: number;
  startTime: string;
  endTime: string;
  isBreak: boolean;
}

// ---- notifications (M10, ADR-018) ----

export type NotificationTypeKey =
  | "HOMEWORK"
  | "HOMEWORK_PUBLISHED"
  | "EXAM_PUBLISHED"
  | "REPORT_CARD_PUBLISHED"
  | "TIMETABLE_UPDATED"
  | "STUDY_MATERIAL"
  | "ANNOUNCEMENT"
  | "SYSTEM"
  | "BEHAVIOUR"
  | "LEAVE"
  | "INVOICE_ISSUED"
  | "PAYMENT_RECEIVED";

export type NotificationPriorityKey = "LOW" | "NORMAL" | "HIGH" | "URGENT";

/**
 * One user's view of a notification (ADR-018 §1) — the immutable event fields
 * merged with this user's read/archive state. `id` is the NotificationRecipient
 * row id (the actionable handle for markRead/archive/delete); `actionUrl` is the
 * deep link to the destination screen.
 */
export interface NotificationDto {
  id: string;
  notificationId: string;
  type: NotificationTypeKey;
  priority: NotificationPriorityKey;
  title: string;
  body: string;
  actionUrl: string | null;
  createdAt: IsoUtcString;
  isRead: boolean;
  readAt: IsoUtcString | null;
  isArchived: boolean;
  archivedAt: IsoUtcString | null;
}

// ---------------------------------------------------------------------------
// Announcements, Circulars & School Calendar (M11, ADR-019)
// ---------------------------------------------------------------------------

export type AnnouncementStatusKey = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type AnnouncementScopeKey = "WHOLE_SCHOOL" | "CLASS" | "SECTION" | "TEACHERS" | "PARENTS";
export type CalendarEventTypeKey = "HOLIDAY" | "EVENT" | "EXAM" | "MEETING" | "OTHER";

/** A file attached to an announcement (ADR-019 §1). `id` is the attachment row id
 *  (the handle for downloadUrl/remove); the storage path is never exposed. */
export interface AnnouncementAttachmentDto {
  id: string;
  announcementId: string;
  fileName: string;
  sizeBytes: number;
  createdAt: IsoUtcString;
}

/** A persistent school announcement / circular (ADR-019 §1). `targetId` is the
 *  Class (CLASS) or Section (SECTION) id the scope points at, else null. */
export interface AnnouncementDto {
  id: string;
  schoolId: string;
  academicYearId: string;
  title: string;
  body: string;
  status: AnnouncementStatusKey;
  scope: AnnouncementScopeKey;
  targetId: string | null;
  publishedAt: IsoUtcString | null;
  createdByStaffId: string;
  createdAt: IsoUtcString;
  updatedAt: IsoUtcString;
  attachments: AnnouncementAttachmentDto[];
}

/** A school calendar entry (ADR-019 §1). Dates are calendar-date strings (YYYY-MM-DD). */
export interface CalendarEventDto {
  id: string;
  schoolId: string;
  academicYearId: string;
  title: string;
  description: string | null;
  eventType: CalendarEventTypeKey;
  startDate: string;
  endDate: string;
  isAllDay: boolean;
  createdByStaffId: string;
  createdAt: IsoUtcString;
  updatedAt: IsoUtcString;
}

// ---------------------------------------------------------------------------
// Student Discipline (M12, ADR-020)
// ---------------------------------------------------------------------------

export type BehaviourCategoryKey =
  "DISCIPLINE" | "BULLYING" | "UNIFORM" | "HOMEWORK" | "MISCONDUCT" | "LATE" | "OTHER";
export type BehaviourSeverityKey = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type BehaviourStatusKey = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";

/** A student discipline incident / teacher referral (ADR-020 §1). Carries both
 *  `studentId` (the person, cross-year) and `enrollmentId` (year/section context).
 *  `teacherId` is the referring/owning teacher's User id. */
export interface BehaviourIncidentDto {
  id: string;
  schoolId: string;
  academicYearId: string;
  studentId: string;
  enrollmentId: string;
  teacherId: string;
  category: BehaviourCategoryKey;
  severity: BehaviourSeverityKey;
  title: string;
  description: string;
  actionTaken: string | null;
  status: BehaviourStatusKey;
  parentNotified: boolean;
  createdByStaffId: string;
  resolvedByStaffId: string | null;
  resolvedAt: IsoUtcString | null;
  createdAt: IsoUtcString;
  updatedAt: IsoUtcString;
}

// ---------------------------------------------------------------------------
// Fees & Payments (M13, ADR-021)
// ---------------------------------------------------------------------------

export type InvoiceStatusKey = "DRAFT" | "ISSUED" | "PARTIAL" | "PAID" | "OVERDUE" | "CANCELLED";
export type PaymentMethodKey = "CASH" | "UPI" | "CARD" | "BANK_TRANSFER" | "CHEQUE" | "ONLINE";

/** A single line of a fee structure (ADR-021 §1). `amount` is in paise (minor units). */
export interface FeeComponentDto {
  id: string;
  feeStructureId: string;
  name: string;
  amount: number;
  order: number;
  mandatory: boolean;
}

/** A named, per-academic-year fee template (ADR-021 §1). */
export interface FeeStructureDto {
  id: string;
  schoolId: string;
  academicYearId: string;
  name: string;
  description: string | null;
  active: boolean;
  components: FeeComponentDto[];
  createdAt: IsoUtcString;
  updatedAt: IsoUtcString;
}

/**
 * A student's fee bill for one enrollment (ADR-021 §1). All amounts are in paise.
 * `status` is the DERIVED display status: a stored ISSUED/PARTIAL invoice past its
 * `dueDate` (IST) surfaces as `OVERDUE` — which is never stored (ADR-021 §3).
 */
export interface InvoiceDto {
  id: string;
  schoolId: string;
  studentId: string;
  enrollmentId: string;
  feeStructureId: string;
  invoiceNumber: string;
  issueDate: IstDateString;
  dueDate: IstDateString;
  status: InvoiceStatusKey;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  remarks: string | null;
  createdByStaffId: string;
  createdAt: IsoUtcString;
  updatedAt: IsoUtcString;
}

/** An immutable receipt for a payment against an invoice (ADR-021 §1). `amount` in paise. */
export interface PaymentDto {
  id: string;
  schoolId: string;
  invoiceId: string;
  receiptNumber: string;
  paymentDate: IstDateString;
  amount: number;
  method: PaymentMethodKey;
  referenceNo: string | null;
  remarks: string | null;
  receivedByStaffId: string;
  createdAt: IsoUtcString;
}

// ---- Documents, Certificates & Downloads (M15, ADR-023) ----

export type DocumentTypeKey =
  | "BONAFIDE_CERTIFICATE"
  | "STUDY_CERTIFICATE"
  | "CHARACTER_CERTIFICATE"
  | "TRANSFER_CERTIFICATE"
  | "FEE_RECEIPT"
  | "REPORT_CARD"
  | "HALL_TICKET"
  | "ID_CARD"
  | "OTHER";

export type DocumentStatusKey = "GENERATED" | "UPLOADED" | "APPROVED" | "ARCHIVED";

/** The values FROZEN at generation time (ADR-023 §3) — system-sourced identity/placement
 * so a later profile change can't rewrite an issued certificate. Free-form per type. */
export interface DocumentSnapshot {
  studentName: string;
  admissionNo: string;
  class: string | null;
  section: string | null;
  academicYear: string | null;
  issuedOn: IstDateString;
  /** Caller-owned per-certificate data (purpose, validity date, …). */
  fields?: Record<string, string>;
}

/**
 * A student's issued/uploaded document (ADR-023). `snapshot` is present for GENERATED
 * docs (frozen at issue). `hasFile` is true iff a downloadable object exists — a
 * metadata-only GENERATED doc has none until rendering lands (§3). `storagePath` is
 * NEVER exposed (private; signed 60s on read).
 */
export interface DocumentDto {
  id: string;
  schoolId: string;
  studentId: string;
  type: DocumentTypeKey;
  status: DocumentStatusKey;
  templateId: string | null;
  snapshot: DocumentSnapshot | null;
  hasFile: boolean;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  approvedAt: IsoUtcString | null;
  archivedAt: IsoUtcString | null;
  createdAt: IsoUtcString;
  updatedAt: IsoUtcString;
}

/** A per-type certificate template (ADR-023 §4). Minimal in v1 — labels/enables a type. */
export interface DocumentTemplateDto {
  id: string;
  schoolId: string;
  type: DocumentTypeKey;
  name: string;
  active: boolean;
  createdAt: IsoUtcString;
  updatedAt: IsoUtcString;
}
