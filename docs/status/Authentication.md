# Status — Authentication & Authorization

- **Status:** Implemented + security-reviewed + tested (M1 Steps 1–10); docs remaining.
- **Current milestone:** M1
- **Completion:** ~95% (Step 11 pending)
- **Dependencies:** `@repo/db`, `@repo/auth`, `@repo/core`, `@repo/business`, `@repo/api`, `@repo/constants`, `@repo/validation`, `@repo/ui`, `@repo/i18n`
- **Frozen?** Yes — implemented layers are frozen (amend only for a security fix from Step 9, a critical bug, or explicit approval).
- **Known issues:**
  - Provisioning (Supabase Admin API) + seed super-admin + SMS provider not built → no real sign-in/OTP yet.
  - Live sign-in/OTP unverified in dev (no Supabase project); verified structurally + unit tests with mocks.
  - Activation (INVITED→ACTIVE) is audited (`USER_ACTIVATED`).
- **Frozen-module amendments (Step 9 security fixes — allowed by freeze protocol):**
  - `packages/auth/src/session.ts` — `signInWithOtp` now passes `shouldCreateUser: false` (blocks anon-key user creation / SMS pumping).
  - `apps/web/next.config.ts` — baseline security headers (X-Frame-Options, nosniff, Referrer-Policy, HSTS, Permissions-Policy).
  - Full report + Supabase dashboard checklist: `docs/SECURITY_REVIEW_M1.md`.
- **Frozen-module amendment (Step 10 — critical bug, allowed by freeze protocol):**
  - `packages/api/src/trpc.ts` — `mapDomainErrors` was dead code: tRPC v11 middleware `next()` returns `{ ok: false, error }` instead of throwing, so its try/catch never fired and every business `DomainError` reached clients as `INTERNAL_SERVER_ERROR`. Now inspects the middleware result and remaps `error.cause instanceof DomainError` → typed code (FORBIDDEN/NOT_FOUND/…). Caught by the new API route-protection tests.
- **Test coverage (Step 10):** 7 suites, 80 tests — `@repo/auth` 22 (getAuthUser cookie/bearer seam, session helpers incl. `shouldCreateUser:false` security regression, rbac), business 20, api 14 (gates, Zod → BAD_REQUEST, DomainError mapping), core 8, web 7 (middleware token rotation, protected-layout redirect), validation 6, utils 3.
- **Next work:** Step 11 (docs).
- **Feature rules:** `docs/features/authentication.md`. Permission catalog: `docs/PERMISSIONS_MATRIX.md`.
