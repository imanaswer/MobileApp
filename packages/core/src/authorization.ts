import { ROLE_PERMISSIONS, type Permission, type RoleKey } from "@repo/constants";

/**
 * Pure authorization evaluators over the fixed Role → Permissions policy
 * (`@repo/constants`). Business services call these instead of comparing role
 * strings, so the policy has one source of truth (Dev PRD §4.4, ADR-002).
 * These answer "does this role hold this capability?" — row/ownership SCOPE
 * (own division / own child / self) is enforced separately in the service.
 */

/** All permissions granted to a role. */
export function getPermissions(role: RoleKey): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

/** Whether a role holds a specific permission. */
export function can(role: RoleKey, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** Whether a role holds at least one of the given permissions. */
export function canAny(role: RoleKey, permissions: readonly Permission[]): boolean {
  return permissions.some((permission) => can(role, permission));
}

/** Whether a role holds all of the given permissions. */
export function canAll(role: RoleKey, permissions: readonly Permission[]): boolean {
  return permissions.every((permission) => can(role, permission));
}
