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
  ],
  // TEACHER: reads academic structure + reads students/enrollments/documents in
  // their OWN sections and their OWN staff profile (row-scope in the service).
  // M4: marks attendance + submits corrections for own sections; reads own-section
  // leave; reads the calendar. Correction/leave DECIDE is admin-only (classTeacher
  // deferred — no class-teacher flag yet, M3 open item).
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
  ],
  ACCOUNTANT: [...SELF_PROFILE],
};
