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

  /* ---- M11 Announcements, Circulars & Calendar (ADR-019) — permission-only. ---- */
  /** Read the persistent announcement feed. Teacher/parent reads carry business
   * targeting (WHOLE_SCHOOL / their section-class / role group); admin reads all. */
  ANNOUNCEMENT_READ: "announcement:read",
  /** Full announcement lifecycle: create/update/publish/archive/delete + attachments.
   * SUPER_ADMIN / OFFICE_ADMIN, any scope. Publish + archive are admin-only (ADR-019 §7). */
  ANNOUNCEMENT_MANAGE: "announcement:manage",
  /** Author DRAFT announcements for OWN sections (create/update/delete draft + attachments;
   * NO publish, NO archive). TEACHER only; scoped to owned SECTION/CLASS in the service —
   * the report_card:remark shape (ADR-019 §7). */
  ANNOUNCEMENT_DRAFT: "announcement:draft",
  /** Read the school calendar (holidays/events/exams/meetings). All in-scope roles —
   * parents hold no academic:read, so this is the cross-role calendar read. Writes ride
   * academic:manage (holiday/M6.5 precedent). */
  CALENDAR_READ: "calendar:read",

  /* ---- M12 Student Discipline (ADR-020) — permission-only, no feature flag.
   * The manage/record/read split mirrors M7's report_card manage/remark/read. Leave
   * reuses the existing leave:apply/decide/read (M4) verbatim — no new leave grant. */
  /** Full behaviour lifecycle for any student: create/update/resolve/close + read all.
   * SUPER_ADMIN / OFFICE_ADMIN. */
  BEHAVIOUR_MANAGE: "behaviour:manage",
  /** Record + progress OWN behaviour incidents (create/update/resolve/close) for OWN
   * students. TEACHER only; teacherId is server-set to self and the student must be in
   * an own section (service scope) — the report_card:remark shape (ADR-020 §6). */
  BEHAVIOUR_RECORD: "behaviour:record",
  /** Read behaviour incidents. Teacher → own + own-section; parent → own child;
   * admin → all (service scope). */
  BEHAVIOUR_READ: "behaviour:read",

  /* ---- M13 Fees & Payments (ADR-021) — permission-only, no feature flag.
   * The manage/read + record/read split mirrors the M7/M12 shape. Money mutations
   * (structures, invoices) are admin-only; payment recording is a separate grant so
   * the front-office collection surface is auditable independently. */
  /** Full fee-structure + invoice lifecycle: create/update structures, generate/issue/
   * cancel invoices, read all. SUPER_ADMIN / OFFICE_ADMIN (ADR-021 §7). */
  FEE_MANAGE: "fee:manage",
  /** Read invoices / dues. Admin → all; teacher → own-section (read-only); parent →
   * own child (the fee portal). SA/OA/T/P (service scope). */
  FEE_READ: "fee:read",
  /** Record a payment against an invoice (office collection). SUPER_ADMIN /
   * OFFICE_ADMIN. Refunds — deferred — would extend this grant (ADR-021 §7). */
  PAYMENT_RECORD: "payment:record",
  /** Read payments / receipts. Admin → all; parent → own child. SA/OA/P (service scope). */
  PAYMENT_READ: "payment:read",

  // ---- Documents, Certificates & Downloads (M15, ADR-023 §6) ----
  /** Generate + upload + delete-draft + archive documents, and template CRUD.
   * SUPER_ADMIN / OFFICE_ADMIN (office/admin generate + upload). */
  DOCUMENT_MANAGE: "document:manage",
  /** Approve a GENERATED/UPLOADED document → APPROVED (the visibility gate).
   * SUPER_ADMIN / OFFICE_ADMIN. */
  DOCUMENT_APPROVE: "document:approve",
  /** List + download documents. Admin → all; teacher → own-section (view-only,
   * APPROVED); parent → own child (APPROVED). SA/OA/T/P (service scope + status). */
  DOCUMENT_READ: "document:read",

  /* ---- M16 School Administration & Configuration (ADR-024 §6) — permission-only.
   * ONE write permission; reads are a role-shaped service projection (branding +
   * public settings for any authenticated; full config for admins), no read grant. */
  /** Update branding/logo/school-profile/academic/system settings — the whole
   * admin console. SUPER_ADMIN / OFFICE_ADMIN ("Office Admin: configured perms"). */
  SETTINGS_MANAGE: "settings:manage",

  // ---- Operations (M17, ADR-025 §9) ----
  /** Super-Admin-only operational tooling — diagnostics, audit-log export, storage
   * verification, cache clear (all read-only / non-destructive; no business data is
   * modified). SUPER_ADMIN ONLY — never granted to OFFICE_ADMIN. */
  SYSTEM_MANAGE: "system:manage",

  /* ---- M18 Messaging — teacher↔parent 1:1 direct messages, permission-only.
   * Both grants held by TEACHER and PARENT only (admins are not a party). Party
   * membership + student/counterparty scope are enforced in the service. */
  /** Open a thread + send a message. TEACHER / PARENT (party-scoped in the service). */
  MESSAGE_SEND: "message:send",
  /** Read own threads + their messages, mark read. TEACHER / PARENT (party-scoped). */
  MESSAGE_READ: "message:read",
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
    // M11: full announcement lifecycle + read + calendar read, school-wide (ADR-019).
    PERMISSIONS.ANNOUNCEMENT_MANAGE,
    PERMISSIONS.ANNOUNCEMENT_READ,
    PERMISSIONS.CALENDAR_READ,
    // M12: full behaviour lifecycle + read, school-wide (ADR-020). Leave decide/read
    // already granted via ATTENDANCE_MANAGE (M4).
    PERMISSIONS.BEHAVIOUR_MANAGE,
    PERMISSIONS.BEHAVIOUR_READ,
    // M13: full fee/invoice lifecycle + payment recording + reads, school-wide (ADR-021).
    PERMISSIONS.FEE_MANAGE,
    PERMISSIONS.FEE_READ,
    PERMISSIONS.PAYMENT_RECORD,
    PERMISSIONS.PAYMENT_READ,
    // M15: full document lifecycle — generate/upload/approve/archive + templates (ADR-023 §6).
    PERMISSIONS.DOCUMENT_MANAGE,
    PERMISSIONS.DOCUMENT_APPROVE,
    PERMISSIONS.DOCUMENT_READ,
    // M16: manage all school configuration (ADR-024 §6).
    PERMISSIONS.SETTINGS_MANAGE,
    // M17: operational tooling — SUPER_ADMIN ONLY (ADR-025 §9); NOT granted to OFFICE_ADMIN below.
    PERMISSIONS.SYSTEM_MANAGE,
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
    // M11: full announcement lifecycle + read + calendar read, school-wide (ADR-019).
    PERMISSIONS.ANNOUNCEMENT_MANAGE,
    PERMISSIONS.ANNOUNCEMENT_READ,
    PERMISSIONS.CALENDAR_READ,
    // M12: full behaviour lifecycle + read, school-wide (ADR-020).
    PERMISSIONS.BEHAVIOUR_MANAGE,
    PERMISSIONS.BEHAVIOUR_READ,
    // M13: full fee/invoice lifecycle + payment recording + reads, school-wide (ADR-021).
    PERMISSIONS.FEE_MANAGE,
    PERMISSIONS.FEE_READ,
    PERMISSIONS.PAYMENT_RECORD,
    PERMISSIONS.PAYMENT_READ,
    // M15: full document lifecycle — generate/upload/approve/archive + templates (ADR-023 §6).
    PERMISSIONS.DOCUMENT_MANAGE,
    PERMISSIONS.DOCUMENT_APPROVE,
    PERMISSIONS.DOCUMENT_READ,
    // M16: manage all school configuration (ADR-024 §6 — "Office Admin: configured permissions").
    PERMISSIONS.SETTINGS_MANAGE,
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
    // M11: reads announcements (targeted in service) + authors DRAFTs for own sections
    // (no publish/archive — admin-only); reads the calendar (ADR-019 §7).
    PERMISSIONS.ANNOUNCEMENT_READ,
    PERMISSIONS.ANNOUNCEMENT_DRAFT,
    PERMISSIONS.CALENDAR_READ,
    // M12: records own behaviour incidents (own students, teacherId=self) + reads
    // own + own-section incidents. Leave read already granted (M4). No leave decide.
    PERMISSIONS.BEHAVIOUR_RECORD,
    PERMISSIONS.BEHAVIOUR_READ,
    // M13: reads invoices/dues for own-section students, read-only (ADR-021 §7). No payment access.
    PERMISSIONS.FEE_READ,
    // M15: views APPROVED documents for own-section students, read-only (ADR-023 §6).
    PERMISSIONS.DOCUMENT_READ,
    // M18: opens/sends + reads teacher↔parent threads with the parents of own-section students.
    PERMISSIONS.MESSAGE_SEND,
    PERMISSIONS.MESSAGE_READ,
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
    // M11: reads announcements (targeted in service) + reads the calendar (ADR-019 §7).
    PERMISSIONS.ANNOUNCEMENT_READ,
    PERMISSIONS.CALENDAR_READ,
    // M12: reads own child's behaviour incidents; applies for + reads leave (M4).
    PERMISSIONS.BEHAVIOUR_READ,
    // M13: reads own child's invoices/dues + payment receipts (the fee portal; ADR-021 §7).
    PERMISSIONS.FEE_READ,
    PERMISSIONS.PAYMENT_READ,
    // M15: downloads own child's APPROVED documents/certificates (ADR-023 §6).
    PERMISSIONS.DOCUMENT_READ,
    // M18: opens/sends + reads teacher↔parent threads with own child's teachers.
    PERMISSIONS.MESSAGE_SEND,
    PERMISSIONS.MESSAGE_READ,
  ],
  ACCOUNTANT: [...SELF_PROFILE, PERMISSIONS.NOTIFICATION_MANAGE_OWN],
};
