import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Session helpers. Token refresh is otherwise automatic — the browser/Expo
 * clients use `autoRefreshToken`, and the web SSR client refreshes via cookies —
 * so these are for the explicit logout / manual-refresh procedures only.
 */

/** Sign out: clears the Supabase session (and its refresh token). */
export async function signOut(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw error;
  }
}

/** Force a session refresh (rotates the access token using the refresh token). */
export async function refreshSession(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.auth.refreshSession();
  if (error) {
    throw error;
  }
}
