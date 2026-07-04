import type { Session, SupabaseClient } from "@supabase/supabase-js";

/**
 * Session & credential operations — the ONLY place the app performs Supabase auth
 * calls (Code Quality: no direct Supabase calls outside auth infrastructure).
 * Token refresh is otherwise automatic (browser/Expo `autoRefreshToken`, web SSR).
 */

export type { Session };

/** Staff sign-in with email + password. */
export async function signInWithPassword(
  supabase: SupabaseClient,
  params: { email: string; password: string },
): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword(params);
  if (error) {
    throw error;
  }
}

/**
 * Parent sign-in step 1 — request an SMS OTP for a phone number.
 * `shouldCreateUser: false` — accounts are pre-provisioned (ADR-001, no public
 * signup); without it supabase-js defaults to true, letting anyone holding the
 * public anon key create auth users and trigger SMS to arbitrary numbers.
 */
export async function signInWithOtp(
  supabase: SupabaseClient,
  params: { phone: string },
): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    phone: params.phone,
    options: { shouldCreateUser: false },
  });
  if (error) {
    throw error;
  }
}

/** Parent sign-in step 2 — verify the SMS OTP code. */
export async function verifyOtp(
  supabase: SupabaseClient,
  params: { phone: string; token: string },
): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({
    phone: params.phone,
    token: params.token,
    type: "sms",
  });
  if (error) {
    throw error;
  }
}

/** Staff password recovery — send a reset email (optionally with a return URL). */
export async function resetPassword(
  supabase: SupabaseClient,
  email: string,
  redirectTo?: string,
): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(
    email,
    redirectTo ? { redirectTo } : undefined,
  );
  if (error) {
    throw error;
  }
}

/** Set a new password (used from the recovery-session update-password screen). */
export async function updatePassword(supabase: SupabaseClient, newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    throw error;
  }
}

/** Current session (verified locally; use for token/session state, not authz). */
export async function getSession(supabase: SupabaseClient): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

/** Subscribe to auth state changes; returns an unsubscribe function. */
export function onAuthStateChange(
  supabase: SupabaseClient,
  callback: (session: Session | null) => void,
): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
  return () => {
    data.subscription.unsubscribe();
  };
}

/** Sign out: clears the Supabase session (and its refresh token). */
export async function signOut(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw error;
  }
}

/**
 * Restore a previously issued session onto a fresh client (session-restoration
 * path: app restart / new process re-adopting stored tokens).
 */
export async function restoreSession(
  supabase: SupabaseClient,
  tokens: { accessToken: string; refreshToken: string },
): Promise<Session> {
  const { data, error } = await supabase.auth.setSession({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
  });
  if (error) {
    throw error;
  }
  if (!data.session) {
    throw new Error("Session could not be restored");
  }
  return data.session;
}

/** Force a session refresh (rotates the access token using the refresh token). */
export async function refreshSession(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.auth.refreshSession();
  if (error) {
    throw error;
  }
}
