import { PERMISSIONS, type RoleKey } from "@repo/constants";
import { ForbiddenError, NotFoundError } from "@repo/core";
import type { UserProfile } from "@repo/types";

import { mapUserToProfile } from "../auth/principal";
import { assertCan } from "../authorization";
import type { ServiceContext } from "../context";

/**
 * Admin user-management services (SUPER_ADMIN only). Each is a sensitive mutation,
 * so it runs inside a transaction that writes the mutation AND its `AuditLog` row
 * atomically (DATABASE_CONVENTIONS §11, ADR-007). Accounts are never deleted —
 * disabling flips status and preserves history.
 */

/** Change another user's role. */
export async function setRole(
  ctx: ServiceContext,
  targetUserId: string,
  role: RoleKey,
): Promise<UserProfile> {
  assertCan(ctx.user, PERMISSIONS.USER_SET_ROLE);
  return ctx.withTransaction(async (repos) => {
    const before = await repos.users.findById(targetUserId);
    if (!before) {
      throw new NotFoundError("User not found");
    }
    const after = await repos.users.setRole(targetUserId, role);
    await repos.audit.record({
      schoolId: ctx.user.schoolId,
      actorUserId: ctx.user.userId,
      action: "USER_SET_ROLE",
      entityType: "User",
      entityId: targetUserId,
      before: { role: before.role },
      after: { role: after.role },
    });
    return mapUserToProfile(after);
  });
}

/** Disable an account (soft — history preserved). Cannot disable yourself. */
export async function disableUser(ctx: ServiceContext, targetUserId: string): Promise<UserProfile> {
  assertCan(ctx.user, PERMISSIONS.USER_DISABLE);
  if (targetUserId === ctx.user.userId) {
    throw new ForbiddenError("You cannot disable your own account");
  }
  return changeStatus(ctx, targetUserId, "DISABLED", "USER_DISABLE");
}

/** Re-enable a disabled account (USER_DISABLE governs account-status management). */
export async function enableUser(ctx: ServiceContext, targetUserId: string): Promise<UserProfile> {
  assertCan(ctx.user, PERMISSIONS.USER_DISABLE);
  return changeStatus(ctx, targetUserId, "ACTIVE", "USER_ENABLE");
}

async function changeStatus(
  ctx: ServiceContext,
  targetUserId: string,
  status: "ACTIVE" | "DISABLED",
  action: string,
): Promise<UserProfile> {
  return ctx.withTransaction(async (repos) => {
    const before = await repos.users.findById(targetUserId);
    if (!before) {
      throw new NotFoundError("User not found");
    }
    const after = await repos.users.setStatus(targetUserId, status);
    await repos.audit.record({
      schoolId: ctx.user.schoolId,
      actorUserId: ctx.user.userId,
      action,
      entityType: "User",
      entityId: targetUserId,
      before: { status: before.status },
      after: { status: after.status },
    });
    return mapUserToProfile(after);
  });
}
