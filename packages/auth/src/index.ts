/**
 * @repo/auth — Supabase client factories, session/context helpers, and RBAC
 * guards. Credentials/OTP are owned by Supabase Auth; we store no passwords
 * (ADR-001, Dev PRD §4.3). No login UI or auth flows live here.
 */
export {
  createBrowserClient,
  createServerClient,
  createExpoClient,
  createHeadlessClient,
  type SupabaseStorage,
} from "./clients";
export type { SupabaseClient } from "@supabase/supabase-js";
export { getAuthUser, type AuthUser } from "./context";
export {
  signInWithPassword,
  signInWithOtp,
  verifyOtp,
  resetPassword,
  updatePassword,
  getSession,
  onAuthStateChange,
  signOut,
  refreshSession,
  restoreSession,
  type Session,
} from "./session";
export { hasRole } from "./rbac";
export {
  createAdminClient,
  adminCreateUser,
  adminFindUserId,
  adminDeleteUser,
  type AdminCreateUserInput,
} from "./admin";
