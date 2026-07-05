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
  ],
  // OFFICE_ADMIN: full academic + People management (M3), school-wide.
  OFFICE_ADMIN: [
    ...SELF_PROFILE,
    PERMISSIONS.ACADEMIC_MANAGE,
    PERMISSIONS.ACADEMIC_READ,
    ...PEOPLE_MANAGE,
    ...PEOPLE_READ,
  ],
  // TEACHER: reads academic structure + reads students/enrollments/documents in
  // their OWN sections and their OWN staff profile (row-scope in the service).
  TEACHER: [
    ...SELF_PROFILE,
    PERMISSIONS.ACADEMIC_READ,
    PERMISSIONS.STUDENT_READ,
    PERMISSIONS.ENROLLMENT_READ,
    PERMISSIONS.STUDENT_DOCUMENT_READ,
    PERMISSIONS.STAFF_READ,
  ],
  // PARENT: reads only their OWN children (students/enrollments/documents) and
  // their OWN parent record (row-scope in the service).
  PARENT: [
    ...SELF_PROFILE,
    PERMISSIONS.STUDENT_READ,
    PERMISSIONS.ENROLLMENT_READ,
    PERMISSIONS.STUDENT_DOCUMENT_READ,
    PERMISSIONS.PARENT_READ,
  ],
  ACCOUNTANT: [...SELF_PROFILE],
};
