/**
 * @repo/auth — Supabase client factories, session/context helpers, and RBAC
 * guards. Credentials/OTP are owned by Supabase Auth; we store no passwords
 * (ADR-001, Dev PRD §4.3). No login UI or auth flows live here.
 */
export {
  createBrowserClient,
  createServerClient,
  createExpoClient,
  type SupabaseStorage,
} from "./clients";
export { getAuthUser, type AuthUser } from "./context";
export { signOut, refreshSession } from "./session";
export { hasRole } from "./rbac";
