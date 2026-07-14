# Environment Variables (M17 / ADR-025)

Every variable, its purpose, and where it's validated. Template: **`.env.example`** (copy to
`.env`, never commit `.env`). Validation is **fail-fast at import**:
`apps/web/src/env.ts` (web, `@t3-oss/env-nextjs` + zod) and `apps/mobile/src/env.ts` (mobile).
`SKIP_ENV_VALIDATION=true` bypasses validation for CI builds only.

## Web / server

| Variable | Req | Scope | Purpose |
|---|---|---|---|
| `APP_ENV` | ✓ | server | `development \| staging \| production` — validated enum; surfaced by `/api/health`. |
| `APP_VERSION` | – | server | Deploy version (git SHA/tag) shown in `/api/health`; defaults to `"unknown"`. |
| `DATABASE_URL` | ✓ | server | Postgres connection (Supabase). Prisma + migrations. Use the **direct** URL (not the pooler) for `pg_dump`/migrate. |
| `SUPABASE_SERVICE_ROLE` | ✓ | **server-only** | Service-role key — signed-URL minting, readiness storage check. **Never** `NEXT_PUBLIC_`; importing it client-side is a build error. |
| `NEXT_PUBLIC_SUPABASE_URL` | ✓ | client | Supabase project URL (browser + CSP `connect-src`). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✓ | client | Supabase anon key (browser auth). |
| `PUSH_NOTIFICATIONS_ENABLED` | – | server | `"true"` wires the Expo push adapter + fan-out (Phase 1). Unset ⇒ in-app only, no delivery. |
| `EXPO_ACCESS_TOKEN` | – | **server-only** | Optional — Expo's enhanced push security token. Push works without it. |
| `AUTH_PROBE_PASSWORD` | – | ops script | Optional — password `scripts/verify-auth.ts` uses for its signup probe; defaults to a random UUID per run (SECURITY_AUDIT WARN 7 remediation). |

## Mobile (Expo — only `EXPO_PUBLIC_*` is bundled)

| Variable | Req | Purpose |
|---|---|---|
| `EXPO_PUBLIC_APP_ENV` | ✓ | Environment marker for the app. |
| `EXPO_PUBLIC_SUPABASE_URL` | ✓ | Supabase project URL. |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | ✓ | Supabase anon key. |
| `EXPO_PUBLIC_API_URL` | ✓ | Base URL of the web tRPC API (e.g. `http://localhost:3000`). |

## Local docker-compose Postgres (dev only)

| Variable | Purpose |
|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | The throwaway `db` service in `docker-compose.yml`. Point `DATABASE_URL` at it for a local DB; **prod DB is Supabase**. |

## Ops / bootstrap scripts (`packages/business/scripts`)

| Variable | Purpose |
|---|---|
| `SEED_SCHOOL_NAME` / `SEED_SUPER_ADMIN_EMAIL` / `SEED_SUPER_ADMIN_PASSWORD` | School + super-admin bootstrap (`pnpm --filter @repo/business run bootstrap`). Password ≥ 10 chars. |
| `TEST_OTP_PHONE` / `TEST_OTP_CODE` | Must match the Supabase test-OTP config for the live verify suite. |

## Integrations (commented until the module lands)
`RAZORPAY_*`, `MSG91_API_KEY`, `GUPSHUP_API_KEY`, `RESEND_API_KEY`, `SENTRY_DSN`, `POSTHOG_KEY` —
placeholders in `.env.example`. Real SMS (MSG91/Gupshup) + custom SMTP (Resend) are
**pre-production blockers** (`SECURITY.md` checklist).

## CI
`SKIP_ENV_VALIDATION=true` + `TURBO_TELEMETRY_DISABLED=1` (`.github/workflows/ci.yml`) — no real
secrets in CI; env schemas validate at runtime, not build.
