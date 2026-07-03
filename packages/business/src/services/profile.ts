import { PERMISSIONS, type LocaleCode } from "@repo/constants";
import type { UserProfile } from "@repo/types";

import { mapUserToProfile, TO_DB_LOCALE } from "../auth/principal";
import { assertCan } from "../authorization";
import type { ServiceContext } from "../context";

export interface UpdateProfileInput {
  locale: LocaleCode;
}

/**
 * Profile service — the caller updates their OWN non-credential fields (M1:
 * locale). Email/phone/password are Supabase Auth operations, not profile
 * updates. Permission: PROFILE_UPDATE_SELF (held by every role); the target is
 * always the caller, so no cross-user scope applies.
 */
export async function updateProfile(
  ctx: ServiceContext,
  input: UpdateProfileInput,
): Promise<UserProfile> {
  assertCan(ctx.user, PERMISSIONS.PROFILE_UPDATE_SELF);
  const updated = await ctx.repositories.users.updateLocale(
    ctx.user.userId,
    TO_DB_LOCALE[input.locale],
  );
  return mapUserToProfile(updated);
}
