# Project Memory — School Management Portal

_The single always-load file. Keep under 2 pages. Update when a step completes._

## Current Milestone

**M1 — Authentication & User Profiles**

## Current Step

**Steps 1–11 complete — M1 awaiting sign-off.** Do not begin M2 without approval.

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

M1 auth fully implemented, security-reviewed, tested, and documented on web + mobile; verified **typecheck 14/14, lint 14/14, tests 7 suites / 80 total, web build (`SKIP_ENV_VALIDATION=true` — no local Supabase env)**. No live Supabase in the dev environment (auth flows verified structurally + unit tests with mocks).

## Known Blockers / Notes

- **Provisioning pending:** Supabase **Admin-API user provisioning + seed (super-admin) + SMS provider** not yet built — required before real sign-in/OTP.
- **Source of truth is now Dev PRD v1.3** (merged from other contributors; reconciles milestone numbering + authz model to this code).
- **Config artifacts to resolve:** a stray root `package-lock.json` (npm) and root `tsconfig.json` were merged in — conflict with the pnpm/Turborepo setup; cleanup pending user decision.

## Next Task

**M1 sign-off** (user decision), then either provisioning (Supabase Admin-API user provisioning + seed super-admin + SMS provider — the go-live blockers) or M2 kickoff on approval.
