import type { Permission, RoleKey, UserStatusKey } from "@repo/constants";
import { can, ForbiddenError } from "@repo/core";

/**
 * The authenticated authorization context an actor carries into every business
 * service. It is built ONLY from the DB `User` profile (never from JWT/client
 * claims — see ADR-001/002): the JWT proves identity (userId); the profile
 * supplies role/schoolId/status. Carrying `schoolId` here means services get
 * tenant context for free and never re-fetch or thread it manually.
 */
export interface Principal {
  userId: string;
  schoolId: string;
  role: RoleKey;
  status: UserStatusKey;
}

/* ============================================================================
 * 1) PERMISSION authorization — "can this ROLE perform this ACTION?"
 *    Decided against the fixed Role→Permission policy (@repo/core `can`).
 * ========================================================================== */

/** Require the actor's role to hold a permission; throws ForbiddenError otherwise. */
export function assertCan(principal: Principal, permission: Permission): void {
  if (!can(principal.role, permission)) {
    throw new ForbiddenError(`Missing permission: ${permission}`);
  }
}

/* ============================================================================
 * 2) SCOPE authorization — "can THIS actor act on THIS resource?"
 *
 * A ScopeRule is a PURE predicate over the principal and the resource's
 * already-loaded ownership facts. The service loads those facts via repositories
 * (which stay authorization-free) and enforces them with `assertScope`.
 *
 * EXTENSION POINT: later milestones add ownership scopes (division / guardian /
 * student / enrollment / school) by defining a new `ScopeRule` in that feature's
 * module and calling `assertScope` — WITHOUT editing this file (Open/Closed). e.g.:
 *
 *   // lives in the attendance module (M2+), not here:
 *   const teachesDivision: ScopeRule<{ taughtDivisionIds: string[]; divisionId: string }> =
 *     (_principal, r) => r.taughtDivisionIds.includes(r.divisionId);
 *   assertScope(principal, { taughtDivisionIds, divisionId }, teachesDivision);
 * ========================================================================== */

export type ScopeRule<TResource> = (principal: Principal, resource: TResource) => boolean;

/** Enforce a scope rule against a resource; throws ForbiddenError if out of scope. */
export function assertScope<TResource>(
  principal: Principal,
  resource: TResource,
  rule: ScopeRule<TResource>,
): void {
  if (!rule(principal, resource)) {
    throw new ForbiddenError("Out of scope for this resource");
  }
}

/** M1 scope rule: the actor owns the target account (the only resource scoped in M1). */
export const ownsAccount: ScopeRule<{ userId: string }> = (principal, resource) =>
  principal.userId === resource.userId;

/* ---- account-ownership convenience wrappers (backwards compatible) ---- */

/** Ownership: the actor must be the target user (uses the `ownsAccount` scope). */
export function assertSelf(principal: Principal, targetUserId: string): void {
  assertScope(principal, { userId: targetUserId }, ownsAccount);
}

/** Ownership with override: the actor is the target, OR holds an override permission. */
export function assertSelfOrCan(
  principal: Principal,
  targetUserId: string,
  override: Permission,
): void {
  if (ownsAccount(principal, { userId: targetUserId })) {
    return;
  }
  assertCan(principal, override);
}
