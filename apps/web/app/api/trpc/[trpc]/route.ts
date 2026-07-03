import { appRouter, createContext } from "@repo/api";
import { createServerClient, getAuthUser } from "@repo/auth";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { cookies } from "next/headers";

import { env } from "@/src/env";

/** Extract a bearer token from the Authorization header (the mobile path). */
function getBearerToken(req: Request): string | undefined {
  const header = req.headers.get("authorization");
  if (header && header.toLowerCase().startsWith("bearer ")) {
    return header.slice(7).trim() || undefined;
  }
  return undefined;
}

/**
 * tRPC HTTP endpoint. Verifies the caller's identity — cookie session (web) or
 * Authorization bearer token (mobile) — then builds the context, which loads the
 * DB profile into the authoritative `Principal` (ADR-002).
 */
function handler(req: Request): Promise<Response> {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: async () => {
      const cookieStore = await cookies();
      const supabase = createServerClient(
        env.NEXT_PUBLIC_SUPABASE_URL,
        env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        {
          getAll: () => cookieStore.getAll(),
          // Route handlers can't mutate cookies; session refresh is handled in
          // middleware (added with the web auth flows).
          setAll: () => undefined,
        },
      );
      const authUser = await getAuthUser(supabase, getBearerToken(req));
      return createContext({ authUser });
    },
  });
}

export { handler as GET, handler as POST };
