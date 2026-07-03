import type { AuthUser } from "@repo/auth";
import { resolvePrincipal, type Principal } from "@repo/business";

/**
 * Per-request tRPC context. The host (Next route handler) verifies the identity
 * (Supabase) and passes the `AuthUser` in; the context then loads the DB profile
 * via the business layer to build the authoritative `Principal` (role/schoolId/
 * status from the DB, never the JWT — ADR-002). `api` never imports `@repo/db`.
 */
export interface Context {
  user: Principal | null;
}

export interface CreateContextOptions {
  authUser: AuthUser | null;
}

export async function createContext({ authUser }: CreateContextOptions): Promise<Context> {
  if (!authUser) {
    return { user: null };
  }
  return { user: await resolvePrincipal(authUser.userId) };
}
