import type { RoleKey } from "@repo/constants";

/**
 * Pure role-membership check. Callers pass the role resolved from the DB `User`
 * profile (via the `Principal`) — NEVER a JWT/client claim (ADR-002). Fine-grained
 * authorization is permission-based (`@repo/core` `can` + business `assertCan`);
 * this remains available for the rare coarse role-membership case.
 */
export function hasRole(role: RoleKey, allowed: readonly RoleKey[]): boolean {
  return allowed.includes(role);
}
