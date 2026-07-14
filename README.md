# School Management Portal

Production-grade, single-school management portal — web admin dashboard (Next.js) + native mobile app (Expo) on one shared, type-safe backend (tRPC + Supabase + Prisma).

> **Status: feature-complete.** All milestones M0–M17 shipped (people, attendance, exams, report cards, homework, fees, analytics, documents, configuration, production readiness), plus the post-M17 phases: push notifications, mobile offline, i18n (EN/ML), server-side PDFs, teacher↔parent messaging, CSV bulk import, and security/perf hardening. The full scope, data model, and decisions live in `School_Portal_DEV_PRD.md` (source of truth), `School_Portal_PRD_v2.md`, and `docs/` (ADRs, conventions, design system, Definition of Done).

---

## Prerequisites

- **Node.js 24 (LTS)** — pinned in `.nvmrc`. With nvm: `nvm use` (or `nvm install`).
- **pnpm 9** — `npm i -g pnpm@9` (or `corepack enable`).
- A POSIX shell. Git.

> Node is pinned to the active LTS on purpose (`engines` in `package.json`). Newer/odd-numbered Node lines are not supported (Expo/Metro target LTS).

## Installation

```bash
nvm use                # selects Node 24 from .nvmrc
pnpm install           # installs all workspaces; generates the Prisma client
cp .env.example .env   # then fill in real values (see below)
```

## Environment variables

Defined and **validated, fail-fast** in `apps/web/src/env.ts` and `apps/mobile/src/env.ts`. Template: `.env.example`. Key ones:

| Variable | Scope | Purpose |
|---|---|---|
| `APP_ENV` | server | `development` \| `staging` \| `production` |
| `DATABASE_URL` | server | Postgres/Supabase connection |
| `SUPABASE_SERVICE_ROLE` | server | privileged key — **never** sent to clients |
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | web client | Supabase public config |
| `EXPO_PUBLIC_SUPABASE_URL` / `_ANON_KEY` / `_API_URL` | mobile | Expo public config |

CI and offline builds set `SKIP_ENV_VALIDATION=true` so `build`/`typecheck` run without real secrets (validation still fires at runtime).

## Running the app

### Web (Next.js) — step by step

1. **Node + deps** (once):
   ```bash
   nvm use && pnpm install
   ```
2. **Env file** — create `apps/web/.env.local` (Next.js reads env from the app
   directory, not the repo root):
   ```bash
   APP_ENV=development
   DATABASE_URL=postgresql://...            # Supabase session pooler, port 5432
   SUPABASE_SERVICE_ROLE=<service-role-key> # server-only, never NEXT_PUBLIC_
   NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
   ```
   Values come from your Supabase project — provision one per
   `docs/RUNBOOK_SUPABASE_SETUP.md`.
3. **Start**:
   ```bash
   pnpm --filter web dev        # → http://localhost:3000
   ```
4. **Verify**: `GET /api/health` → 200 (liveness, dependency-free);
   `GET /api/ready` → 200 when DB **and** storage are reachable (503 otherwise,
   with per-check booleans). Opening `/` redirects to `/login`.

> **No Supabase yet?** The app boots against any Postgres: point `DATABASE_URL`
> at a local DB with the migrations applied
> (`psql -f packages/db/prisma/migrations/*/migration.sql`, skipping the `*_rls`
> ones — they need Supabase's `auth` schema) and use syntactically-valid
> placeholders for the three Supabase vars. Every page renders and `/api/ready`
> honestly reports `storage: false` — but **sign-in will not work**: auth is
> Supabase-direct, there is no local fallback.

### Mobile (Expo) — step by step

1. **Env file** — create `apps/mobile/.env` (only `EXPO_PUBLIC_*` is bundled):
   ```bash
   EXPO_PUBLIC_APP_ENV=development
   EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
   EXPO_PUBLIC_API_URL=http://localhost:3000   # the web app hosts the tRPC API
   ```
   On a **physical device**, `localhost` is the phone — use your machine's LAN
   IP (`http://192.168.x.x:3000`) and keep the web dev server running.
2. **Start the web dev server first** (the mobile app has no API of its own),
   then:
   ```bash
   pnpm --filter mobile start   # Expo dev server — press i (iOS sim) / a (Android) / w (web)
   ```
   Or scan the QR code with the Expo Go app on your phone.

### Login credentials

There are **no default or hardcoded credentials** — public signup is disabled
(ADR-001); every account is provisioned via the Supabase Admin API by the ops
scripts, which read the repo-root `.env` (copy `.env.example`):

1. **Super admin** (once per environment) — set in root `.env`:
   `SEED_SCHOOL_NAME`, `SEED_SUPER_ADMIN_EMAIL`,
   `SEED_SUPER_ADMIN_PASSWORD` (≥ 10 chars, your choice), then:
   ```bash
   pnpm --filter @repo/business run bootstrap
   ```
   Sign in on the web at `/login` → **Staff** tab with that email + password.
2. **Staff** (admin/teacher — email + password):
   ```bash
   pnpm --filter @repo/business run provision -- --role TEACHER --email t@school.example --password <pw>
   ```
3. **Parents** (phone OTP):
   ```bash
   pnpm --filter @repo/business run provision -- --role PARENT --phone +919999900001 --locale ml
   ```
   Sign in on the **Parent** tab with the phone number. Until a real SMS
   provider is wired (tracked go-live blocker), **only the Supabase test OTP
   number works**: configure `TEST_OTP_PHONE` → `TEST_OTP_CODE` (default
   `+919999900001` → `123456`) in Supabase per `docs/RUNBOOK_SUPABASE_SETUP.md`
   — test numbers receive no SMS; type the configured code.

Accounts are created `INVITED` and flip to `ACTIVE` on first sign-in. Roles and
what each can see: `docs/PERMISSIONS_MATRIX.md`.

Common scripts (root, run across the monorepo via Turborepo):

```bash
pnpm lint         # ESLint (incl. import-boundary rules)
pnpm typecheck    # tsc --noEmit everywhere
pnpm test         # Vitest unit/integration
pnpm db:validate  # prisma validate
pnpm build        # build web (+ any buildable packages)
pnpm ci           # lint → typecheck → test → db:validate → build
pnpm format       # Prettier write
```

## Monorepo layout

```
apps/
  web      Next.js 15 (App Router) — admin dashboard + hosts the tRPC API
  mobile   Expo (expo-router + NativeWind) — staff + parents
packages/
  api          tRPC routers — transport only (validate → authorize → call business)
  auth         Supabase client factories, session/context helpers, RBAC guard
  business     application use-cases & orchestration (the only place features live)
  constants    enums, config constants, feature-flag/role/channel keys
  core         pure, framework-agnostic domain logic (no Prisma/tRPC/React)
  db           Prisma schema, client, migrations, seed, repositories (only Prisma consumer)
  i18n         English + Malayalam catalogs, locale utilities, provider
  notifications  NotificationService + channel adapter interfaces (no provider SDKs)
  types        shared TypeScript types & DTO envelopes (no runtime code)
  ui           design tokens, cn(), Tailwind preset, theme provider
  utils        generic domain-agnostic helpers (incl. IST date)
  validation   shared Zod schemas (tRPC inputs, RHF forms, imports)
```

### Layering & boundaries (enforced by ESLint)

```
UI (web/mobile) → tRPC routers (api) → business services → repositories (db) → Prisma → Postgres
                                                         ↘ core (pure rules)
```

- `core` is pure — no frameworks, no IO. `db` is the **only** Prisma consumer.
- `api` routers are transport-only and never touch Prisma. `apps` never import `db`/`business`/`@prisma/client`.
- These rules are enforced by `no-restricted-imports` in `eslint.config.mjs` (see `docs/CODING_STANDARDS.md` §4).

## Coding workflow

1. Branch off `main`: `feat/…`, `fix/…`, `chore/…` (no direct commits to `main`).
2. Work in the right layer (business logic → `packages/business`, never in routers/UI).
3. Commit with **Conventional Commits** (`feat(scope): …`) — enforced by commitlint; `pre-commit` runs lint-staged.
4. Before opening a PR, `pnpm ci` must pass. CI (`.github/workflows/ci.yml`) re-runs it and blocks merge on failure.
5. Satisfy `docs/DEFINITION_OF_DONE.md` for any feature.

## Documentation

- `School_Portal_DEV_PRD.md` — build source of truth (scope, schema, milestones).
- `School_Portal_PRD_v2.md` — product context.
- `docs/architecture/ADR-001..009.md` — architecture decisions.
- `docs/{API_CONVENTIONS,DATABASE_CONVENTIONS,CODING_STANDARDS,DEFINITION_OF_DONE,UI_DESIGN_SYSTEM}.md`.

### Planning & design references (2026-07)

- `docs/REVIEW_FINDINGS.md` — documentation audit: contradictions, logic gaps, open items (read first).
- `docs/USER_FLOWS.md` — end-to-end flows per role (F1–F14).
- `docs/NAVIGATION_MAP.md` — expo-router + App Router route trees, guards, push deep links.
- `docs/SCREEN_INVENTORY.md` — every screen with role, APIs, milestone.
- `docs/COMPONENT_INVENTORY.md` — `packages/ui` primitives + domain components build checklist.
- `docs/API_INVENTORY.md` — full tRPC catalog + scheduled jobs, webhooks, notification event matrix.
- `docs/DB_RELATIONSHIP_DIAGRAM.md` — Mermaid ERD of the target schema.
- `docs/PERMISSIONS_MATRIX.md` — permission × role × scope catalog (extends Dev PRD §5).
- `docs/STATE_MANAGEMENT_PLAN.md` — Query/Zustand/RHF ownership, keys, cache policy.
- `docs/OFFLINE_STRATEGY.md` — baseline caching + `offline` attendance queue design.
- `docs/ANALYTICS_LOGGING_PLAN.md` — PostHog/Sentry/logging taxonomy + DPDP privacy rules.
