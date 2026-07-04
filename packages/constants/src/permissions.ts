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
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** Every authenticated user can act on their own profile — the baseline grant. */
const SELF_PROFILE: readonly Permission[] = [
  PERMISSIONS.PROFILE_READ_SELF,
  PERMISSIONS.PROFILE_UPDATE_SELF,
];

/**
 * The fixed Role → Permissions policy (Dev PRD §5). Only SUPER_ADMIN manages
 * users/roles and reads the audit log; all other roles get the self-profile
 * baseline in M1. Later milestones extend each role's array with their feature
 * permissions. Every role must appear (compile-time enforced by the type).
 */
export const ROLE_PERMISSIONS: Readonly<Record<RoleKey, readonly Permission[]>> = {
  SUPER_ADMIN: [
    ...SELF_PROFILE,
    PERMISSIONS.USER_READ,
    PERMISSIONS.USER_INVITE,
    PERMISSIONS.USER_SET_ROLE,
    PERMISSIONS.USER_DISABLE,
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.ACADEMIC_MANAGE,
    PERMISSIONS.ACADEMIC_READ,
  ],
  // OFFICE_ADMIN manages academic structure (M2); teachers read it (assignment
  // reads scoped to own in the service). Accountant/parent have no academic surface yet.
  OFFICE_ADMIN: [...SELF_PROFILE, PERMISSIONS.ACADEMIC_MANAGE, PERMISSIONS.ACADEMIC_READ],
  TEACHER: [...SELF_PROFILE, PERMISSIONS.ACADEMIC_READ],
  PARENT: [...SELF_PROFILE],
  ACCOUNTANT: [...SELF_PROFILE],
};
