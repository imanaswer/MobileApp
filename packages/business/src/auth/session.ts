import { ForbiddenError, NotFoundError } from "@repo/core";
import type { UserRepository } from "@repo/db";

import type { Principal } from "../authorization";
import type { ServiceContext } from "../context";
import { repositories } from "../repositories";

import { mapUserToPrincipal } from "./principal";

/**
 * Server auth context source: load the DB profile for a verified identity and
 * build the authoritative `Principal` (role/schoolId/status from the DB, never
 * the JWT — ADR-001/002). Returns `null` when the identity has no profile yet
 * (valid Supabase user, but not provisioned/registered) — the caller treats that
 * as unauthenticated. The repository is injected (default = composition root) so
 * this is unit-testable without a database.
 */
export async function resolvePrincipal(
  userId: string,
  users: UserRepository = repositories.users,
): Promise<Principal | null> {
  const user = await users.findById(userId);
  return user ? mapUserToPrincipal(user) : null;
}

/**
 * Activation flow (profile synchronization): `INVITED → ACTIVE` on first sign-in,
 * stamping lastLoginAt. The status change AND its `AuditLog` row commit atomically
 * inside one transaction (same pattern as setRole/disableUser/enableUser — ADR-007,
 * DATABASE_CONVENTIONS §11); if the audit write fails, activation rolls back.
 * Idempotent — an already-`ACTIVE` account just refreshes lastLoginAt and is NOT
 * re-audited. `DISABLED` is rejected (access revoked; history preserved).
 */
export async function activateUser(ctx: ServiceContext): Promise<Principal> {
  return ctx.withTransaction(async (repos) => {
    const user = await repos.users.findById(ctx.user.userId);
    if (!user) {
      throw new NotFoundError("No profile for this account");
    }
    if (user.status === "DISABLED") {
      throw new ForbiddenError("Account is disabled");
    }
    if (user.status !== "INVITED") {
      // Already active — idempotent re-sign-in: refresh lastLoginAt, no audit.
      const touched = await repos.users.touchLastLogin(ctx.user.userId);
      return mapUserToPrincipal(touched);
    }
    const activated = await repos.users.activate(ctx.user.userId);
    await repos.audit.record({
      schoolId: ctx.user.schoolId,
      actorUserId: ctx.user.userId,
      action: "USER_ACTIVATED",
      entityType: "User",
      entityId: ctx.user.userId,
      before: { status: user.status },
      after: { status: activated.status },
    });
    return mapUserToPrincipal(activated);
  });
}
