import {
  createClient,
  type SupabaseClient,
  type User as AuthUserRecord,
} from "@supabase/supabase-js";

/**
 * Admin (service-role) operations — SERVER/OPS ONLY. The service-role key
 * bypasses RLS and must never reach client code (Dev PRD §11, security review).
 * Used by provisioning/seed scripts (ADR-001: accounts are pre-created via the
 * Admin API, never public signup) and, later, by admin invite procedures.
 */

/** Service-role client. No session persistence — every call is key-authenticated. */
export function createAdminClient(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Staff are provisioned with email+password; parents with phone (OTP). */
export interface AdminCreateUserInput {
  email?: string;
  password?: string;
  phone?: string;
}

/**
 * Create a pre-confirmed auth user and return its UID (`User.id` in our DB).
 * Confirmed at creation — there is no signup confirmation flow for
 * pre-provisioned accounts; access is still gated by our INVITED→ACTIVE
 * lifecycle, not by Supabase confirmation state.
 */
export async function adminCreateUser(
  supabase: SupabaseClient,
  input: AdminCreateUserInput,
): Promise<string> {
  const { data, error } = await supabase.auth.admin.createUser({
    ...(input.email !== undefined ? { email: input.email, email_confirm: true } : {}),
    ...(input.password !== undefined ? { password: input.password } : {}),
    ...(input.phone !== undefined ? { phone: input.phone, phone_confirm: true } : {}),
  });
  if (error) {
    throw error;
  }
  return data.user.id;
}

/**
 * Find an existing auth user by email or phone, or `null`. Supabase's Admin API
 * has no direct lookup-by-identifier, so this pages through `listUsers` — fine
 * for a single-school deployment; revisit if the user count grows past a few
 * thousand. Phones are compared without the leading `+` (Supabase strips it).
 */
export async function adminFindUserId(
  supabase: SupabaseClient,
  identifier: { email?: string; phone?: string },
): Promise<string | null> {
  const email = identifier.email?.toLowerCase();
  const phone = identifier.phone?.replace(/^\+/, "");
  const perPage = 200;
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw error;
    }
    const match = data.users.find(
      (user: AuthUserRecord) =>
        (email !== undefined && user.email?.toLowerCase() === email) ||
        (phone !== undefined && user.phone === phone),
    );
    if (match) {
      return match.id;
    }
    if (data.users.length < perPage) {
      return null;
    }
  }
}

/** Delete an auth user (test/rollback tooling only — real accounts are DISABLED, never deleted). */
export async function adminDeleteUser(supabase: SupabaseClient, userId: string): Promise<void> {
  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) {
    throw error;
  }
}
