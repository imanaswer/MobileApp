import type { RoleKey } from "./roles";

/**
 * Project-wide permission catalog. Authorization maps Role → Permission(s) →
 * (scope) → business service — code checks a PERMISSION, never a hard-coded role
 * string. Roles are fixed; permissions are centralized here for readability,
 * testing, and extensibility. Evaluators live in `@repo/core` (pure `can()`).
 *
 * A permission names a CAPABILITY (`resource:action[:scope]`). Row/ownership
 * SCOPE (own division / own child / self) is enforced separately in the service
 * layer (Dev PRD §4.4, ADR-002) — a permission grants the ability; scope narrows
 * the target.
 *
 * M1 (auth) defines only the cross-cutting auth/admin permissions below, derived
 * from the RBAC matrix (Dev PRD §5). Feature permissions (attendance, marks,
 * homework, fees, …) are added by their own milestones — never invented here.
 */
export const PERMISSIONS = {
  /** Read one's own profile. Held by every authenticated role. */
  PROFILE_READ_SELF: "profile:read:self",
  /** Update one's own non-credential profile fields (locale, prefs). */
  PROFILE_UPDATE_SELF: "profile:update:self",

  /** Read any user account (admin). */
  USER_READ: "user:read",
  /** Provision a new (INVITED) account. */
  USER_INVITE: "user:invite",
  /** Change another user's role. */
  USER_SET_ROLE: "user:set_role",
  /** Disable a user (soft — preserves history). */
  USER_DISABLE: "user:disable",

  /** Read the audit log. */
  AUDIT_READ: "audit:read",

  /** Manage academic structure (years/terms/classes/sections/subjects/assignments). */
  ACADEMIC_MANAGE: "academic:manage",
  /** Read academic structure. Teacher-assignment reads are scoped to own (service). */
  ACADEMIC_READ: "academic:read",

  /* ---- People Management (M3). Reads carry ROW scope (own-section / own-child),
   * narrowed in the service; the permission only grants the capability. */
  /** Create/update/archive student identity records. */
  STUDENT_MANAGE: "student:manage",
  /** Read students. Teacher → own-section; parent → own children (service scope). */
  STUDENT_READ: "student:read",
  /** Enroll / transfer / promote / withdraw (per-year placement, ADR-010). */
  ENROLLMENT_MANAGE: "enrollment:manage",
  /** Read enrollments. Teacher → own-section; parent → own children (service scope). */
  ENROLLMENT_READ: "enrollment:read",
  /** Manage parent/guardian records and their student links. */
  PARENT_MANAGE: "parent:manage",
  /** Read parents. Parent role → own record only (service scope). */
  PARENT_READ: "parent:read",
  /** Manage staff (employment) profiles. */
  STAFF_MANAGE: "staff:manage",
  /** Read staff profiles. Teacher → own record only (service scope). */
  STAFF_READ: "staff:read",
  /** Upload / replace / delete student document metadata. */
  STUDENT_DOCUMENT_MANAGE: "student_document:manage",
  /** Read student documents. Teacher → PHOTO only; parent → own children (service). */
  STUDENT_DOCUMENT_READ: "student_document:read",

  /* ---- Attendance Management (M4, ADR-011). Reads/marks carry ROW scope
   * (own-section / own-child), narrowed in the service. */
  /** Mark attendance (open session, mark records, submit, lock). Teacher → own-section. */
  ATTENDANCE_MARK: "attendance:mark",
  /** Read attendance (sessions/records/summary). Teacher → own-section; parent → own child. */
  ATTENDANCE_READ: "attendance:read",
  /** Submit an attendance correction request. Teacher → own-section. */
  ATTENDANCE_CORRECT_SUBMIT: "attendance:correct:submit",
  /** Approve/reject an attendance correction (updates the record). */
  ATTENDANCE_CORRECT_DECIDE: "attendance:correct:decide",
  /** Apply for leave. Parent → own child only (service scope). */
  LEAVE_APPLY: "leave:apply",
  /** Approve/reject a leave request. */
  LEAVE_DECIDE: "leave:decide",
  /** Read leave requests. Teacher → own-section; parent → own applications. */
  LEAVE_READ: "leave:read",
  /** Read the holiday calendar (all in-scope roles). Writes use ACADEMIC_MANAGE. */
  HOLIDAY_READ: "holiday:read",

  /* ---- Examination & Assessment (M5, ADR-012). Mark ENTRY carries own-section
   * scope (added in Step 5); exam/assessment/grade-scale MANAGE + publish + delete
   * is admin-only (PERMISSIONS_MATRIX §Exams — exam:manage). */
  /** Manage exams/assessments/grade-scales + publish + delete. Admin-only. */
  EXAM_MANAGE: "exam:manage",
  /** Enter/submit marks for a register. Teacher → own subject×section (service scope). */
  MARK_ENTER: "marks:enter",
  /** Read marks/grades/GPA. Teacher → own section; parent → own child PUBLISHED only (service scope). */
  MARK_READ: "marks:read",

  /* ---- Homework & Assignment Management (M6, ADR-013). Ownership DERIVED from
   * TeacherAssignment (own subject×section); parent reads carry own-child scope,
   * all narrowed in the service. §11 of the ADR. */
  /** Create/edit/publish/close/reopen/delete homework + teacher attachments. Teacher → own subject×section. */
  HOMEWORK_MANAGE: "homework:manage",
  /** Read homework. Teacher → own subject×section; parent → own child (PUBLISHED/CLOSED, §10). */
  HOMEWORK_READ: "homework:read",
  /** Create/resubmit a submission + parent attachments. Parent-only, own child (service scope). */
  SUBMISSION_SUBMIT: "submission:submit",
  /** Return/accept a submission + write feedback. Teacher → own subject×section. */
  SUBMISSION_REVIEW: "submission:review",
  /** Read submissions/feedback. Teacher → own subject×section; parent → own child's own (service scope). */
  SUBMISSION_READ: "submission:read",

  /* ---- Report Cards & Academic Results (M7, ADR-014). Lifecycle authority is
   * admin (generate/approve/publish/reopen/revoke/correct); the class teacher
   * authors a remark + submits — narrowed by the assertClassTeacherOfEnrollment
   * SCOPE (a subject teacher of the same section is refused); reads carry own-
   * section / own-child(PUBLISHED) row scope. R1/R2/R3. */
  /** Generate/approve/publish/reopen/revoke/correct a card + edit principal remarks/promotion. Admin-only. */
  REPORT_CARD_MANAGE: "report_card:manage",
  /** Draft the class-teacher remark + submit for review. Teacher → own-section (class-teacher scope). */
  REPORT_CARD_REMARK: "report_card:remark",
  /** Read report cards. Teacher → own-section; parent → own child PUBLISHED only (service scope). */
  REPORT_CARD_READ: "report_card:read",

  /* ---- Timetable Management (M9, ADR-017). Ownership DERIVED from TeacherAssignment
   * (never ClassTeacherAssignment). Reads carry ROW scope (teacher → own slots;
   * parent → own child's section), narrowed in the service. Permission-only gate —
   * NOT feature-flag gated (ADR-017 §4: no flag infra exists; timetable is core,
   * the ADR-013/M6 precedent). */
  /** Manage bell schedule / periods / timetable entries. Admin-only. */
  TIMETABLE_MANAGE: "timetable:manage",
  /** Read the timetable. Teacher → own slots; parent → own child's section (service scope). */
  TIMETABLE_READ: "timetable:read",

  /* ---- M10 Notifications (ADR-018) — permission-only, no feature flag. ---- */
  /** Act on one's OWN in-app inbox: list, unreadCount, markRead, markAllRead,
   * archive, unarchive, delete. Self-scope (userId = self) in the service. Held
   * by every authenticated role. */
  NOTIFICATION_MANAGE_OWN: "notification:manage_own",
  /** Compose + send an ANNOUNCEMENT notification (admin). SUPER_ADMIN / OFFICE_ADMIN. */
  ANNOUNCEMENT_SEND: "announcement:send",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** Every authenticated user can act on their own profile — the baseline grant. */
const SELF_PROFILE: readonly Permission[] = [
  PERMISSIONS.PROFILE_READ_SELF,
  PERMISSIONS.PROFILE_UPDATE_SELF,
];

/** Full People-Management mutation grant (SUPER_ADMIN + OFFICE_ADMIN, M3). */
const PEOPLE_MANAGE: readonly Permission[] = [
  PERMISSIONS.STUDENT_MANAGE,
  PERMISSIONS.ENROLLMENT_MANAGE,
  PERMISSIONS.PARENT_MANAGE,
  PERMISSIONS.STAFF_MANAGE,
  PERMISSIONS.STUDENT_DOCUMENT_MANAGE,
];

/** Full People-Management read grant (SUPER_ADMIN + OFFICE_ADMIN, M3). */
const PEOPLE_READ: readonly Permission[] = [
  PERMISSIONS.STUDENT_READ,
  PERMISSIONS.ENROLLMENT_READ,
  PERMISSIONS.PARENT_READ,
  PERMISSIONS.STAFF_READ,
  PERMISSIONS.STUDENT_DOCUMENT_READ,
];

/** Full Attendance management grant (SUPER_ADMIN + OFFICE_ADMIN, M4). Holiday
 *  writes ride ACADEMIC_MANAGE (both admins already hold it). */
const ATTENDANCE_MANAGE: readonly Permission[] = [
  PERMISSIONS.ATTENDANCE_MARK,
  PERMISSIONS.ATTENDANCE_READ,
  PERMISSIONS.ATTENDANCE_CORRECT_SUBMIT,
  PERMISSIONS.ATTENDANCE_CORRECT_DECIDE,
  PERMISSIONS.LEAVE_DECIDE,
  PERMISSIONS.LEAVE_READ,
  PERMISSIONS.HOLIDAY_READ,
];

/**
 * The fixed Role → Permissions policy (Dev PRD §5). Only SUPER_ADMIN manages
 * users/roles and reads the audit log; all other roles get the self-profile
 * baseline in M1. Later milestones extend each role's array with their feature
 * permissions. Every role must appear (compile-time enforced by the type).
 */
export const ROLE_PERMISSIONS: Readonly<Record<RoleKey, readonly Permission[]>> = {
  // Full management of everything: users, academic structure, and all People
  // Management (M3). No row-scope restriction (super-admin → all).
  SUPER_ADMIN: [
    ...SELF_PROFILE,
    PERMISSIONS.USER_READ,
    PERMISSIONS.USER_INVITE,
    PERMISSIONS.USER_SET_ROLE,
    PERMISSIONS.USER_DISABLE,
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.ACADEMIC_MANAGE,
    PERMISSIONS.ACADEMIC_READ,
    ...PEOPLE_MANAGE,
    ...PEOPLE_READ,
    ...ATTENDANCE_MANAGE,
    PERMISSIONS.EXAM_MANAGE,
    PERMISSIONS.MARK_ENTER,
    PERMISSIONS.MARK_READ,
    // M6: full homework management + review, school-wide (no submission:submit — admins don't submit for a child).
    PERMISSIONS.HOMEWORK_MANAGE,
    PERMISSIONS.HOMEWORK_READ,
    PERMISSIONS.SUBMISSION_REVIEW,
    PERMISSIONS.SUBMISSION_READ,
    // M7: full report-card lifecycle + read, school-wide (ADR-014 §7 — office/principal authority).
    PERMISSIONS.REPORT_CARD_MANAGE,
    PERMISSIONS.REPORT_CARD_READ,
    // M9: full timetable management + read, school-wide (ADR-017).
    PERMISSIONS.TIMETABLE_MANAGE,
    PERMISSIONS.TIMETABLE_READ,
    // M10: own inbox + announcement authorship, school-wide (ADR-018).
    PERMISSIONS.NOTIFICATION_MANAGE_OWN,
    PERMISSIONS.ANNOUNCEMENT_SEND,
  ],
  // OFFICE_ADMIN: full academic + People management (M3) + Attendance (M4), school-wide.
  OFFICE_ADMIN: [
    ...SELF_PROFILE,
    PERMISSIONS.ACADEMIC_MANAGE,
    PERMISSIONS.ACADEMIC_READ,
    ...PEOPLE_MANAGE,
    ...PEOPLE_READ,
    ...ATTENDANCE_MANAGE,
    PERMISSIONS.EXAM_MANAGE,
    PERMISSIONS.MARK_ENTER,
    PERMISSIONS.MARK_READ,
    // M6: full homework management + review, school-wide (ADR-013 §11 — "Admin ALL").
    PERMISSIONS.HOMEWORK_MANAGE,
    PERMISSIONS.HOMEWORK_READ,
    PERMISSIONS.SUBMISSION_REVIEW,
    PERMISSIONS.SUBMISSION_READ,
    // M7: full report-card lifecycle + read, school-wide (ADR-014 §7).
    PERMISSIONS.REPORT_CARD_MANAGE,
    PERMISSIONS.REPORT_CARD_READ,
    // M9: full timetable management + read, school-wide (ADR-017).
    PERMISSIONS.TIMETABLE_MANAGE,
    PERMISSIONS.TIMETABLE_READ,
    // M10: own inbox + announcement authorship, school-wide (ADR-018).
    PERMISSIONS.NOTIFICATION_MANAGE_OWN,
    PERMISSIONS.ANNOUNCEMENT_SEND,
  ],
  // TEACHER: reads academic structure + reads students/enrollments/documents in
  // their OWN sections and their OWN staff profile (row-scope in the service).
  // M4: marks attendance + submits corrections for own sections; reads own-section
  // leave; reads the calendar. Correction/leave DECIDE stays admin-only (M4, frozen).
  // A class-teacher concept now exists as ClassTeacherAssignment (M7 foundation) —
  // used only for report-card remark authorship; wiring it into attendance/leave
  // DECIDE is out of scope and unchanged here.
  TEACHER: [
    ...SELF_PROFILE,
    PERMISSIONS.ACADEMIC_READ,
    PERMISSIONS.STUDENT_READ,
    PERMISSIONS.ENROLLMENT_READ,
    PERMISSIONS.STUDENT_DOCUMENT_READ,
    PERMISSIONS.STAFF_READ,
    PERMISSIONS.ATTENDANCE_MARK,
    PERMISSIONS.ATTENDANCE_READ,
    PERMISSIONS.ATTENDANCE_CORRECT_SUBMIT,
    PERMISSIONS.LEAVE_READ,
    PERMISSIONS.HOLIDAY_READ,
    // M5: enters + submits marks for own assigned subject×section (register lock is admin-only).
    PERMISSIONS.MARK_ENTER,
    PERMISSIONS.MARK_READ,
    // M6: manages/reads/reviews homework for own assigned subject×section (derived ownership).
    PERMISSIONS.HOMEWORK_MANAGE,
    PERMISSIONS.HOMEWORK_READ,
    PERMISSIONS.SUBMISSION_REVIEW,
    PERMISSIONS.SUBMISSION_READ,
    // M7: the class teacher (assertClassTeacherOfEnrollment scope) authors a remark + submits;
    // reads own-section cards. A subject teacher holds these too but the scope refuses them.
    PERMISSIONS.REPORT_CARD_REMARK,
    PERMISSIONS.REPORT_CARD_READ,
    // M9: reads OWN timetable slots only (teacherId = self, service scope). No management.
    PERMISSIONS.TIMETABLE_READ,
    // M10: own in-app inbox (self-scope). No announcement authorship.
    PERMISSIONS.NOTIFICATION_MANAGE_OWN,
  ],
  // PARENT: reads only their OWN children (students/enrollments/documents) and
  // their OWN parent record (row-scope in the service). M4: reads own child's
  // attendance, applies for + reads own leave, reads the calendar.
  PARENT: [
    ...SELF_PROFILE,
    PERMISSIONS.STUDENT_READ,
    PERMISSIONS.ENROLLMENT_READ,
    PERMISSIONS.STUDENT_DOCUMENT_READ,
    PERMISSIONS.PARENT_READ,
    PERMISSIONS.ATTENDANCE_READ,
    PERMISSIONS.LEAVE_APPLY,
    PERMISSIONS.LEAVE_READ,
    PERMISSIONS.HOLIDAY_READ,
    // M5: reads own child's PUBLISHED marks/grades only (service scope), never edits.
    PERMISSIONS.MARK_READ,
    // M6: reads own child's published homework, submits/resubmits for own child, reads own submissions/feedback.
    PERMISSIONS.HOMEWORK_READ,
    PERMISSIONS.SUBMISSION_SUBMIT,
    PERMISSIONS.SUBMISSION_READ,
    // M7: reads own child's PUBLISHED report cards only (service scope), never edits.
    PERMISSIONS.REPORT_CARD_READ,
    // M9: reads own child's SECTION timetable (service scope), never edits.
    PERMISSIONS.TIMETABLE_READ,
    // M10: own in-app inbox (self-scope). No announcement authorship.
    PERMISSIONS.NOTIFICATION_MANAGE_OWN,
  ],
  ACCOUNTANT: [...SELF_PROFILE, PERMISSIONS.NOTIFICATION_MANAGE_OWN],
};
