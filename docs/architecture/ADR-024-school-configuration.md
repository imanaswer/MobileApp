# ADR-024 — School Administration & Configuration — M16

**Status:** Accepted — **M16 implemented (Steps 1–9)** · **Date:** 2026-07-12 · design approved 2026-07-12 (three additive config tables keyed `schoolId @unique`; frozen M1 `School` NOT reused; per-table settings split driven by the RLS read-audience — Branding broadly-readable, School/System admin-only; `AcademicSettings` folded into `SchoolSettings`; one `settings:manage` permission with a role-shaped read projection; config **inert w.r.t. every frozen engine** in v1) · **Deciders:** Architecture, Product
**Related:** ADR-002 (business layer is the authorization gate; routers thin) ·
ADR-003 (repositories own all Prisma/SQL — M16 adds new config repos, no cross-domain writes) ·
ADR-004 (**private buckets + server-minted signed URLs** — logo upload reuses `StoragePort`; new `branding` bucket, no new storage code) ·
ADR-007 (AuditLog — **every M16 mutation writes one**, in the mutation's transaction) ·
ADR-008 (loose `schoolId` — all three new tables carry it, `@unique`) ·
ADR-014 / ADR-023 (**seam-provisioned, wiring-deferred** posture — M16 *stores* config that no frozen engine reads in v1, the metadata-first analog) ·
M1 `School` (the frozen tenant row with `settings Json?` / `logoUrl` / `defaultLocale` — **left untouched**, §2) ·
PERMISSIONS_MATRIX (M16 adds **one** permission — `settings:manage`).
**Precedes:** M16 (School Administration & Configuration) — this ADR fixes the design; Steps 2–9 execute it.

---

> **Milestone framing.** M16 adds a **school administration console** — configure branding, academic defaults, numbering,
> language, timezone, theme and working week — over frozen M1–M15. It is **completely additive**: **three new tables**
> (`SchoolSettings`, `BrandingSettings`, `SystemSettings`), **one new private bucket** (`branding`), **one new permission**
> (`settings:manage`). **Zero ALTER on any M1–M15 table** (M1 `School` included — its unused `settings`/`logoUrl` columns
> are *not* reused, §2), **no business-logic change** to any existing domain. **Configuration influences only future
> actions and never rewrites a historical record** (the brief's hard rule). Proven at Step 2 by `prisma migrate diff`
> (only the three new tables). OUT OF SCOPE (brief): auth, payments, and every existing engine (attendance/exam/fee/
> report-card/timetable/homework/analytics/notifications), PDF rendering, transport, library, inventory, AI.

## Context

Everything M16 needs already has a home; the only genuinely new questions are *which table each setting lives in* (an RLS
consequence, §3) and *whether any frozen engine reads the config* (no — §5).

- **A frozen `School.settings Json?` + `logoUrl` already exist** (`schema.prisma:47`) but are unused and **frozen** — M1
  `School` ships RLS `admin-read-only` (`m1_rls_hardening`), no write policy. Writing config into that row would change
  frozen M1 behaviour and fight its RLS. §2 keeps `School` untouched and adds new tables instead.
- **The storage seam is built and proven.** `StoragePort` + `storageProcedure` + the web Supabase adapter mint signed
  upload/download URLs for M3/M6/M11/M15. **Logo upload reuses it verbatim** — one new bucket constant `branding`, no new
  storage code (the M15 `documents` move).
- **The `Locale` enum (`EN`/`ML`) already exists** and IST is hard-coded everywhere. M16 **reuses `Locale`** for default
  language (no new enum) and *stores* a timezone/theme/working-week the app does not yet branch on (§5).
- **The domain-module shape is fixed** — `services/<domain>/` (service + `scope.ts` re-exporting `recordAudit`/
  `isFullAccess` + `mappers.ts` + `index.ts` barrel + test), one repo per aggregate in `db/src/repositories/`, thin
  routers mounted flat in `root.ts`, Zod inputs in the single `packages/validation/src/index.ts`, `cuid()` ids, loose
  `schoolId`, no `@@map`, `recordAudit` inside `ctx.withTransaction`, `assertCan` at the top of each mutation. M16 follows
  this skeleton exactly.

## Decision

### 1. Three new tables, one new bucket, zero frozen change

- **`SchoolSettings` + `BrandingSettings` + `SystemSettings` only** (the brief's triad, mirrored by the three Step-4
  services and Step-5 router namespaces). No column, enum, or constraint added to any M1–M15 table. Proven by
  `migrate diff` at Step 2.
- **Single-tenant note:** each table is keyed `schoolId @unique` → **exactly one row per school** ("single configuration
  row per school"). A settings write is an **upsert** on that row (no create/delete lifecycle).
- **New private bucket `branding`** (added to `STORAGE_BUCKETS`; provisioned via the runbook, like every other bucket) for
  the logo. Store `logoPath` only; **never persist a URL** (DB conventions §4); serve via a signed URL.

### 2. `School` (M1) is NOT reused — new tables, frozen row untouched (stated for the record)

`School.settings`/`logoUrl`/`defaultLocale` look like the natural home, but reusing them would (a) **ALTER-free but still
change frozen M1 behaviour** (M1 shipped these read-only, admin-only, unwritten), and (b) fight `m1_rls_hardening`'s
admin-**read**-only policy — there is no write path. New config tables sidestep both: `School` stays frozen, the config
lives in tables M16 owns end-to-end. (`School.defaultLocale` remains the *auth-time* default; `SystemSettings.language` is
the *admin-configured* school default — distinct concerns, no migration of the old column.)

### 3. Which setting lives in which table is decided by the RLS read-audience (**the load-bearing decision**)

Coarse row-level RLS = **one read-audience per table** (the M11–M15 posture). So the table a setting sits in *is* its
visibility. The Step-3 matrix (admin ALL / office-admin manage / teacher public-read / parent branding-read / anon none)
forces the split — this is *why* three tables, not one:

| Table | Read audience (RLS) | Holds |
|---|---|---|
| **`BrandingSettings`** | **any authenticated** (admin/office/teacher/parent) | `logoPath` (nullable), `primaryColor`, `secondaryColor?`, `displayName?` — the one **broadly-readable** group (a parent's app shows the logo/name/colours). |
| **`SchoolSettings`** | **admin-only** (SELECT `is_academic_admin`) | School **profile** (contactEmail?/contactPhone?/website?/principalName?) **+ academic defaults** (`academicYearStartMonth`, promotion/report-card/attendance/grading defaults) **+ numbering** (`invoicePrefix`, `certificatePrefix`). |
| **`SystemSettings`** | **admin-only** (SELECT `is_academic_admin`) | `timezone` (String, default `"Asia/Kolkata"`), `language` (`Locale`, default `EN`), `theme` (String, default `"light"`), `workingDays` (Int[] 0–6). |

- **`AcademicSettings` (the 4th Step-1 group) is absorbed into `SchoolSettings`** — same admin-only audience, same "how
  this school runs" concern; a separate table would split one audience across two rows for no RLS gain. The compound,
  nobody-reads-them-yet defaults (report-card/attendance/grading) live in a **nullable `academicDefaults Json`** column
  (the escape hatch, §4); the scalars the console edits directly are typed columns.
- **"Parents read branding + calendar preferences" = `BrandingSettings` (new) + the existing M11 `CALENDAR_READ`**
  (parents already hold it; the school calendar is unchanged). M16 introduces **no new parent-facing table beyond
  Branding**. `workingDays` sits in admin-only `SystemSettings` — it is inert config in v1 (§5); if a future calendar
  wants to *display* the working week to parents, that read moves to a parent-visible surface then, not now.

### 4. Typed columns for the scalars the console edits; JSON only for the deferred compound defaults

The settings the admin console renders as form fields are a **small fixed set** → typed columns (validation + typecheck;
the ReportCard fixed-snapshot precedent, *not* the ADR-023 variable-by-type JSON case). A single nullable
`academicDefaults Json` on `SchoolSettings` absorbs the compound report-card/attendance/grading defaults **no engine reads
yet** (§5) — reserved shape, no speculative columns. `workingDays Int[]` (Postgres native array) for the working week.

### 5. Configuration is **inert w.r.t. history** — stored, but read by no frozen engine in v1 (design principle)

The brief's hard rule: *"configuration affects only future actions… must not change historical records… no attendance/
exam/fee/report-card/timetable logic changes."* Therefore M16 is the **ADR-014/ADR-023 seam-provisioned, wiring-deferred**
analog:

- Several settings — **invoice/certificate numbering, timezone (vs hard-coded IST), default language, attendance/grading/
  report-card defaults** — are **stored but consumed by no engine in v1.** Wiring frozen M13/M15 number generators, the
  IST date layer, or the M4/M5/M7 engines to read this config would be a frozen-module behaviour change → **out of scope.**
- **Only new M16 surfaces may read config**: the admin console and the mobile/web app shell rendering the logo/theme/name
  (all *display*, all *future actions*). Frozen engines never read it. This is disclosed as a Consequence, not a veto flag
  — the brief already mandates it. (When a future milestone *does* wire, e.g., `invoicePrefix` into invoice generation,
  that is an explicit change to that domain, not M16.)

### 6. One new permission — `settings:manage` (writes); reads are role-shaped projections, no new read grant

The brief says "reuse existing permissions where possible" and "Office Admin: configured permissions." Minimal realization:

| Permission | SA | OA | T | P | AC | Meaning |
|---|---|---|---|---|---|---|
| `settings:manage` | ✓ | ✓ | – | – | – | update branding/logo/school-profile/academic/system settings (every capability in Step 4). |

- **"Office Admin: configured permissions" is satisfied by a fixed `settings:manage` grant to OA** — M16 does **not** build
  a permission-configuration system (settings that reconfigure a role's permissions); that would be a speculative
  meta-feature. OA holds `settings:manage`; SA holds it too.
- **No new read permission.** Reads are a **role-shaped service projection** on `protectedProcedure`:
  `settings.getBranding` (any authenticated → branding + public projection) and `settings.getAll` (admin → everything,
  gated by `settings:manage`). Teachers/parents get the "selected public settings" as the branding-plus-public projection —
  no dedicated grant needed. Accountant: none new (self-profile only).

### 7. Layering & API — thin routers, three services, every mutation audited

- **Repos** (`db/src/repositories/school-settings.repository.ts`, `branding-settings.repository.ts`,
  `system-settings.repository.ts`) own all Prisma — `getBySchool` + `upsert`; no business logic.
- **Services** (`services/settings/`) — the brief's three logical services (`settingsService` / `brandingService` /
  `configurationService`) as functions in one domain module: `updateSchoolProfile`, `updateAcademicDefaults`,
  `updateBranding` (+ `brandingLogoUploadUrl` minting via `StoragePort`), `updateSystemSettings`, plus the read
  projections. `assertCan(settings:manage)` at the top of each mutation; `recordAudit` (before/after Json) **inside
  `ctx.withTransaction`** for **every** upsert.
- **Routers** — thin `settings.*` / `branding.*` / `configuration.*` (validate Zod from `@repo/validation` → delegate);
  logo upload via `storageProcedure`. Mounted flat in `root.ts`.

### 8. RLS + storage isolation (defense-in-depth; empirical proofs at Step 3)

Coarse RLS mirroring the M11–M15 posture; business is the real gate (§6):

- `BrandingSettings`: **admin ALL**, **any-authenticated SELECT**, **anon none**.
- `SchoolSettings` / `SystemSettings`: **admin ALL** (SELECT+write), **teacher/parent none** (their "public" reads are the
  service projection off `BrandingSettings` + the typed public subset the service chooses to expose), **anon none**.
- Bucket `branding` is **private** — logo served via a server-minted signed URL after the read check (ADR-004). Storage
  policy proofs at Step 3.

## Deviations from the literal brief (flagged for veto at STOP)

1. **`AcademicSettings` is a column group inside `SchoolSettings`, not a 4th table (§3).** Step 1 lists it as a concept;
   Step 2 mandates only three tables. Same admin audience → folded in (compound defaults in a JSON escape hatch). If you
   want a distinct `AcademicSettings` table, say so.
2. **Numbering/timezone/language/academic settings are stored but wired to no engine in v1 (§5).** The brief's own
   no-logic-change rule forbids touching frozen generators; consuming the config is a future per-domain change.
3. **One new permission, not a permission-configuration system (§6).** "Office Admin: configured permissions" → a fixed
   `settings:manage` grant, not settings that reconfigure permissions.
4. **`School.settings`/`logoUrl` are not reused (§2)** — frozen M1 row left untouched; config lives in new tables.

## Alternatives considered

1. **One `SchoolSettings` table with JSON sub-objects.** Rejected (§3) — coarse RLS is per-table, so branding (parent-
   readable) and system (admin-only) *must* be separate rows; also desyncs from the brief's three services/routers.
2. **Reuse the frozen `School.settings`/`logoUrl` columns.** Rejected (§2) — changes frozen M1 behaviour, no write RLS.
3. **Wire numbering/timezone into the frozen engines now.** Rejected (§5) — violates the additive/no-logic-change rule.
4. **A permission-configuration engine for "Office Admin: configured permissions."** Rejected (§6) — speculative
   meta-feature; a fixed `settings:manage` grant meets the brief.

## Consequences

- (+) **Completely additive** — three tables, one bucket, one permission; every frozen M1–M15 table/service untouched
  (proven by `migrate diff` at Step 2). `School` and its RLS preserved.
- (+) **Secure by default** — branding readable by any authenticated user; school/system config admin-only (RLS + service
  projection); private logo bucket, signed-on-read.
- (+) **Reuses the proven seams** — `StoragePort` for logo (no new storage code), the `Locale` enum for language, the
  `manage`-plus-projection permission shape.
- (+) **Thin, testable** — §6 table is the permission-matrix test spec; each setting write is an audited upsert.
- (−) **Several stored settings are inert in v1 (§5)** — numbering/timezone/language/academic defaults are recorded and
  editable but read by no engine, because wiring frozen domains would break the no-logic-change rule. Disclosed, not a
  defect; each is a named future per-domain change.

## STOP — Step 1 boundary — ✅ APPROVED 2026-07-12

All decisions approved as designed: **(a)** three tables + `branding` bucket + one `settings:manage` permission, zero
frozen change; **(b)** `School` left frozen, not reused; **(c)** the **per-table settings mapping** (§3 — branding
broadly-readable; school-profile + academic + numbering and system all admin-only), including **`AcademicSettings` folded
into `SchoolSettings`**; **(d)** **"parents read calendar preferences" = the existing M11 `CALENDAR_READ`**, so Branding
is the only new parent-readable table; **(e)** **config is inert w.r.t. every frozen engine in v1**.

## Implementation notes (Steps 2–9, folded back)

- **Three additive tables** (`SchoolSettings`, `BrandingSettings`, `SystemSettings`) each `schoolId @unique` (one row per
  school; upsert), migration `20260712070000_school_configuration`. **No relational FKs** (loose `schoolId` + loose
  `updatedByUserId`, the M3 `*ByUserId` idiom); `SystemSettings.language` reuses the frozen `Locale` enum; `workingDays
  Int[]` default `{1,2,3,4,5}`. **Zero frozen-table ALTER** — proven by `migrate diff` (3 CreateTable + 3 unique indexes,
  empty post-apply diff). `School` (settings/logoUrl/defaultLocale) untouched.
- **RLS** migration `20260712070100_settings_rls` — reuses `is_academic_admin()` verbatim; `BrandingSettings` admin ALL +
  any-authenticated SELECT (the M11 `SchoolCalendarEvent` precedent), `SchoolSettings`/`SystemSettings` admin ALL only,
  anon none. **15/15 empirical proofs** (branding read all-roles; school/system admin-only; write isolation). New private
  bucket `branding` (runbook §3e).
- **Business `services/settings/`** — the three logical services as functions: `brandingService` (`getPublicSettings`
  projection, `getBranding`, `updateBranding`, `brandingLogoUploadUrl`/`brandingLogoUrl` via `StoragePort`),
  `settingsService` (`getSchoolSettings`, `updateSchoolSettings`), `configurationService` (`getSystemSettings`,
  `updateSystemSettings`). Every mutation is an audited upsert (`recordAudit` in-tx). Locale round-trips DB `EN/ML` ↔ app
  `en/ml`. One permission `settings:manage` (SA/OA); reads are role-shaped (public projection vs admin-only), no read grant.
- **API** — thin `settings.*` / `branding.*` / `configuration.*` (9 procedures); logo via `storageProcedure`; Zod inputs in
  `@repo/validation` (`.nullish()` clears; `hexColor`/`localeSchema`/`themeSchema`).
- **Mobile** — `(app)/settings/index.tsx`: everyone reads branding + theme/language; admins edit theme + language inline;
  school profile read-only with a web-console pointer (the M13/M15 mobile-is-lighter precedent).
- **Web** — `(app)/settings/page.tsx`: full admin console (branding + logo upload, school profile + numbering + academic,
  system + working-week) + CSV export of the current configuration; read-only view for non-admins.
- **v1 simplifications accepted:** numbering/timezone/language/academic settings are stored but read by **no frozen
  engine** (§5 — a future per-domain wire); the audit-history viewer + audit shortcut are deferred (no audit-read surface
  exists); "backup/export" = the CSV export; mobile admin-editing limited to theme/language.
- **Gate green** — lint 35/35, typecheck 35/35 (incl. mobile), test (business +4 settings, api +12 transport), db:validate,
  web build 41/41 (`/settings`). Zero new dependency.
