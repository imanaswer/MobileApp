# Project Memory — School Management Portal

_The single always-load file. Keep under 2 pages. Update when a step completes._

## Current Milestone

**M2 — Academic Foundation** (kicked off 2026-07-05; scope = academic structure only — see `docs/milestones/M2.md`)

## Current Step

**M2 Steps 1–10 COMPLETE (2026-07-05)** — deliverables reported; **STOPPED
awaiting user approval before M3**.

## Completed

- ✓ **M0** — Foundation (Turborepo, 12 packages, web+mobile shells, CI) — **FROZEN**
- ✓ M1 Step 1 — Requirements analysis
- ✓ M1 Step 2 — Auth DB design (User, UserStatus, DeviceToken, AuditLog, School enums) + init migration
- ✓ M1 Step 3 — Authorization design (permission + scope, `ScopeRule` extension point)
- ✓ M1 Step 4 — Auth architecture (Supabase clients, JWT verify, context→Principal, activation)
- ✓ M1 Step 5 — API layer (`auth.me`, `auth.registerProfile`)
- ✓ M1 Step 6 — Business layer (`updateProfile`, `setRole`, `disableUser`, `enableUser` + audit-in-tx)
- ✓ M1 Step 7 — Mobile auth (splash/gate/login/OTP/session/logout/role shell)
- ✓ M1 Step 8 — Web auth (login/forgot/OTP/protected layout/middleware/logout/dashboard)
- ✓ Workflow — Intelligent context loading system (`.claude/START_HERE.md` router + `docs/architecture_index.md`; docs only, no code changed)
- ✓ M1 Step 9 — Security review (`docs/SECURITY_REVIEW_M1.md`): fixed OTP `shouldCreateUser:false` (SMS-pumping/user-creation hole) + added web security headers; Supabase dashboard config checklist pending provisioning
- ✓ M1 Step 10 — Tests: 7 suites / 80 tests (auth 22, business 20, api 14, core 8, web 7, validation 6, utils 3). **Caught+fixed critical bug:** `mapDomainErrors` (`packages/api/src/trpc.ts`) was dead code — tRPC v11 `next()` returns a result, never throws — so business `DomainError`s surfaced as 500s; now remaps `error.cause` to typed codes (frozen-module amendment, allowed as critical bug)
- ✓ M1 Step 11 — Documentation: `API_INVENTORY.md` auth section (implemented, gates, 6 procedures), `API_CONVENTIONS.md` §6 error-mapping nuance, `features/authentication.md` + status/milestone docs synced; no new ADR
- ✓ **M1 approved & frozen** (2026-07-05)
- ✓ **M1.5 — Infrastructure Provisioning**: live Supabase project (`wupcsvbyrknfuuskzuzp`) wired + migrated; `@repo/auth` admin module; bootstrap/provision/verify ops scripts (`packages/business/scripts`); auth security config applied via Management API (signups off, test OTP, OTP 600s, pw ≥10, URLs); **11/11 live auth checks passed** (OTP, email login, activation, session restore, refresh, logout, provisioning, signup-disabled); web build + expo android bundle with real env; `docs/RUNBOOK_SUPABASE_SETUP.md` + `docs/milestones/M1.5-infrastructure.md`

- ✓ **M2 Steps 1–5** (2026-07-05) — requirements analysis; DB schema + migration
  (6 models, live-probed constraints); RLS policies (`20260705010000_academic_rls`);
  6 business services (permission+scope gated, audited in-tx); 6 thin API routers
  + Zod inputs (`istDateSchema`)
- ✓ **M2 Step 6** — mobile read-only academic screens (years/classes/subjects/
  assignments) + role-aware Home links
- ✓ **M2 Step 7** — web CRUD `/academic/*` (years+terms, classes+sections,
  subjects, assignments) with search/pagination/filters/dialogs; manage-gated UI
- ✓ **M2 Step 8** — tests: 17 files / 136 total (business 50, auth 32, api 25,
  validation 11, core 8, web 7, utils 3); typecheck+lint 14/14; web prod build
  with real env validation
- ✓ **M2 Steps 9–10** — docs synced (API_INVENTORY rewritten to implemented
  surface, feature + status docs added) + deliverables report → awaiting approval

- ✓ **M1 RLS hardening** (security-fix exception, 2026-07-05): M1 auth tables shipped with no RLS. Migration `20260705020000_m1_rls_hardening` enables RLS (not FORCE) on School/User/DeviceToken/AuditLog with read-only policies (`user_read_self` + `is_admin()` reads; owner-only device tokens; admin-only School/AuditLog) — stops parent/teacher user enumeration; no write policies (writes stay service_role); anon denied. Defense-in-depth only. **Blocking pre-apply gate:** confirm live Prisma role bypasses RLS before applying or auth locks out (see `docs/RLS_POLICIES.md`). All 80 tests still green.

## Frozen Modules (read-only — see workflow.md)

- M0 scaffold + tooling + CI
- Auth DB models (`packages/db`), Authorization (`packages/core` + `packages/business/authorization`)
- Business auth services (`packages/business/{auth,services}`), API auth router (`packages/api`)
- Mobile auth (`apps/mobile/src/{app,lib,stores,providers}`), Web auth (`apps/web` auth routes + middleware + `src/lib/supabase`)

> Frozen = amend only for a critical bug, a security fix (Step 9 may amend), or explicit user approval.

## Architecture Rules (authoritative summary — see .claude/project_rules.md)

- Business logic only in `packages/business` services; **routers stay thin** (validate → authorize → delegate).
- **Repositories contain no authorization**; only `packages/db` imports `@prisma/client`.
- **`api` never imports `db`; `apps` never import `db`/`business`** (use `@repo/api`).
- **Authorization = permission (`assertCan`) + scope (`assertScope`) in the business layer**, on the DB-built `Principal`. No role from JWT/client. No transport role gate.
- **Role/schoolId/status come only from the DB `User` profile.**
- Sensitive mutations write an `AuditLog` row in the same transaction.
- RLS is defense-in-depth (Prisma bypasses it); IST everywhere; add-ons behind `FeatureFlag`.

## Dependency Rules (package boundaries)

`core` pure (types/constants/utils only) · `db` = only Prisma consumer · `business` composes db+core+notifications · `api` → business (not db) · `apps` → api/ui/i18n (not db/business). Enforced by ESLint `no-restricted-imports`.

## Current Status

M1 auth implemented, reviewed, and **frozen**. **M2 Academic Foundation complete
(Steps 1–10, 2026-07-05), awaiting approval:** six academic entities with DB
invariants (partial-unique ACTIVE year, gist EXCLUDE term overlap, CHECKs,
Restrict FKs), RLS defense-in-depth, six permission-gated services (mutations
audited in-tx), six thin routers, web CRUD (`/academic/*`), mobile read-only
placeholders, docs synced. Verified **typecheck 14/14, lint 14/14, tests 17
files / 136 total, web production build with real env validation** (root `.env`
from M1.5). `@repo/core` added as a web+mobile dependency (UI `can()` checks).

## Known Blockers / Notes

- **Real SMS provider pending:** Twilio creds are placeholders; only the test OTP number (`+919999900001`) works. Provider choice + India DLT needed before parent go-live.
- **Rotate credentials before real data:** service-role key + DB password (+ seed admin password) were shared during setup; HIBP protection needs the Pro plan; custom SMTP before production. See M1.5 doc "Deferred".
- **Source of truth is now Dev PRD v1.3** (merged from other contributors; reconciles milestone numbering + authz model to this code).
- **Config artifacts to resolve:** a stray root `package-lock.json` (npm) and root `tsconfig.json` were merged in — conflict with the pnpm/Turborepo setup; cleanup pending user decision.

## Next Task

**STOPPED — M2 deliverables reported; waiting for user approval before M3**
(people records: Student/Guardian/Staff, enrollment, guardian↔student links,
teacher picker for assignments, class-teacher flag).
