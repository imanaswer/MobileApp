import { createAdminClient, type SupabaseClient } from "@repo/auth";

/**
 * Shared plumbing for ops scripts (bootstrap / provision / verify). These run
 * from the repo via `pnpm --filter @repo/business run <script>` with the root
 * `.env` loaded by dotenv-cli — they are operator tooling, NOT request-path
 * code. Supabase stays behind `@repo/auth`; persistence behind `@repo/db`.
 */

/** Read a required env var or fail fast with an actionable message. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env var ${name} — fill it in the repo root .env (see .env.example).`);
  }
  return value;
}

/** Service-role admin client from env (server/ops only). */
export function adminClientFromEnv(): SupabaseClient {
  return createAdminClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE"),
  );
}

/** Minimal `--flag value` argv parser for ops scripts. */
export function parseFlags(argv: readonly string[]): Map<string, string> {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") {
      continue; // package-manager argument separator, not a flag
    }
    if (arg?.startsWith("--")) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`Flag ${arg} requires a value`);
      }
      flags.set(arg.slice(2), value);
      i += 1;
    }
  }
  return flags;
}

/** Ops log line (scripts are CLI tools; console is their UI). */
export function log(message: string): void {
  console.warn(message);
}
