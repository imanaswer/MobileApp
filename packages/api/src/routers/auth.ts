import {
  activateUser,
  createServiceContext,
  disableUser,
  enableUser,
  setRole,
  updateProfile,
} from "@repo/business";
import { setRoleInput, updateProfileInput, userIdInput } from "@repo/validation";

import { onboardingProcedure, protectedProcedure, router } from "../trpc";

/**
 * Authentication & user-profile procedures. Thin transport only — validate (Zod),
 * gate, and delegate to a business service; no logic, no role strings, no Prisma
 * here (ADR-002). `me`/`registerProfile` run on `onboardingProcedure` (so an
 * INVITED user can activate); the rest run on `protectedProcedure` (ACTIVE), and
 * the service enforces the fine-grained permission. Logout/refresh are client-side
 * session operations (`@repo/auth` helpers).
 */
export const authRouter = router({
  /** The current authenticated principal (userId, schoolId, role, status). */
  me: onboardingProcedure.query(({ ctx }) => ctx.user),

  /** Activate the pre-provisioned account on first sign-in (INVITED → ACTIVE). Idempotent. */
  registerProfile: onboardingProcedure.mutation(({ ctx }) =>
    activateUser(createServiceContext(ctx.user)),
  ),

  /** Update the caller's own profile (M1: locale). */
  updateProfile: protectedProcedure
    .input(updateProfileInput)
    .mutation(({ ctx, input }) => updateProfile(createServiceContext(ctx.user), input)),

  /** SUPER_ADMIN: change another user's role (audited). */
  setRole: protectedProcedure
    .input(setRoleInput)
    .mutation(({ ctx, input }) => setRole(createServiceContext(ctx.user), input.userId, input.role)),

  /** SUPER_ADMIN: disable an account (soft, audited). */
  disableUser: protectedProcedure
    .input(userIdInput)
    .mutation(({ ctx, input }) => disableUser(createServiceContext(ctx.user), input.userId)),

  /** SUPER_ADMIN: re-enable a disabled account (audited). */
  enableUser: protectedProcedure
    .input(userIdInput)
    .mutation(({ ctx, input }) => enableUser(createServiceContext(ctx.user), input.userId)),
});
