import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The verified IDENTITY from Supabase — it proves *who* the caller is, and
 * nothing more. It intentionally carries NO role / schoolId / status:
 * authorization data comes ONLY from our DB `User` profile (mapped into the
 * business `Principal`), NEVER from the JWT or any client-supplied claim
 * (ADR-001/002). The context builder takes this `userId`, loads the profile,
 * and constructs the authoritative `Principal`.
 */
export interface AuthUser {
  userId: string;
  email: string | null;
  phone: string | null;
}

/**
 * Resolve the verified identity from Supabase, or `null` if unauthenticated.
 * `supabase.auth.getUser()` re-validates server-side (it is NOT `getSession()`,
 * which trusts local storage). Pass `accessToken` for the mobile bearer-token
 * path; omit it for the web cookie path. This single seam encapsulates
 * verification, so swapping to local JWKS verification later touches one place.
 */
export async function getAuthUser(
  supabase: SupabaseClient,
  accessToken?: string,
): Promise<AuthUser | null> {
  const { data, error } = accessToken
    ? await supabase.auth.getUser(accessToken)
    : await supabase.auth.getUser();
  if (error || !data.user) {
    return null;
  }
  return {
    userId: data.user.id,
    email: data.user.email ?? null,
    phone: data.user.phone ?? null,
  };
}
