# School Administration & Configuration (M16, ADR-024)

A school administration panel over frozen M1–M15 — configure branding, school profile, numbering, academic defaults,
language, timezone, theme and the working week. **Completely additive**: three config tables, one private bucket, one
permission. **Configuration influences only future actions and never rewrites a historical record.**

## Model

Three tables, each keyed `schoolId @unique` → **exactly one row per school** (single-tenant → one row; a write is an
upsert). The frozen M1 `School` row (`settings`/`logoUrl`/`defaultLocale`) is **not reused** — the config lives in tables
M16 owns (ADR-024 §2). No relational FKs: `schoolId` is a loose tenant scalar (ADR-008) and `updatedByUserId` a loose
actor scalar (the M3 `*ByUserId` idiom).

| Table | Read audience | Holds |
|---|---|---|
| `BrandingSettings` | **any authenticated** | `logoPath` (private bucket path), `primaryColor`, `secondaryColor`, `displayName` |
| `SchoolSettings` | **admin only** | contact email/phone, website, principal, `academicYearStartMonth`, `invoicePrefix`, `certificatePrefix`, `academicDefaults` (reserved JSON) |
| `SystemSettings` | **admin only** | `timezone` (default `Asia/Kolkata`), `language` (reuses `Locale` EN/ML), `theme` (light/dark/system), `workingDays` (`Int[]`, default Mon–Fri) |

The **table a setting lives in is its RLS read-audience** (coarse row-level RLS = one audience per table). Branding is the
one broadly-readable group (a parent's app shows the logo/name/colours); school profile / academic / numbering / system
are admin-only. `AcademicSettings` (a Step-1 concept) is folded into `SchoolSettings` — same admin audience.

## Permissions

**One new** — `settings:manage` (SUPER_ADMIN / OFFICE_ADMIN). It gates **every write**. There is **no read permission**:
reads are a role-shaped service projection — `settings.getPublic` returns branding + theme/language to any authenticated
user; `settings.get` / `configuration.get` return the full admin config only to `settings:manage` holders. Teachers,
parents and accountants hold no settings permission. "Parents read calendar preferences" is satisfied by the existing M11
`CALENDAR_READ` (unchanged) + the branding projection.

## Services (`packages/business/src/services/settings/`)

The brief's three logical services as functions in one domain module; every mutation is an audited upsert (`recordAudit`
inside `ctx.withTransaction`):

- **brandingService** — `getPublicSettings` (the projection), `getBranding`, `updateBranding`, `brandingLogoUploadUrl` /
  `brandingLogoUrl` (mint signed URLs against the private `branding` bucket via the ADR-004 `StoragePort`).
- **settingsService** — `getSchoolSettings`, `updateSchoolSettings` (profile + numbering + academic defaults).
- **configurationService** — `getSystemSettings`, `updateSystemSettings` (timezone/language/theme/working-week). Locale
  round-trips DB `EN/ML` ↔ app `en/ml` via the existing `TO_APP/DB_LOCALE`.

## API (`settings.*` / `branding.*` / `configuration.*`)

Nine thin procedures (validate Zod → delegate). Logo upload/download via `storageProcedure`. See `API_INVENTORY.md`.

## Clients

- **Web** `(app)/settings/page.tsx` — full Administration console for admins: branding + logo upload, school profile +
  numbering + academic, system + working-week, and **CSV export** of the current configuration (the backup/export
  deliverable). Non-admins get a read-only view. Dashboard gains an "Administration" quick-link.
- **Mobile** `(app)/settings/index.tsx` — everyone reads branding + theme/language; admins edit **theme + language**
  inline; school profile is shown read-only with a pointer to the web console.

## Security

- Private `branding` bucket; logo served via a short-lived server-minted signed URL after a read check (ADR-004).
- RLS is defense-in-depth (the business layer is the real gate): branding readable by any authenticated user; school/
  system config admin-only; anon denied. **15/15 empirical isolation proofs** (`settings_rls/rls-verify.sql`).

## Deferred / v1 limitations

1. **Configuration is inert w.r.t. every frozen engine** — numbering, timezone (vs hard-coded IST), default language and
   academic/report-card/attendance/grading defaults are **stored but read by no engine in v1** (ADR-024 §5). Wiring a
   frozen domain to consume the config is a future per-domain change (it would violate the additive/no-logic-change rule
   here). This is the ADR-014/ADR-023 "seam-provisioned, wiring-deferred" posture.
2. **Audit-history viewer + audit shortcut deferred** — no audit-read API/page exists in the repo; every settings change
   is still audited, but a viewer is out of this milestone's additive scope.
3. **"Backup/export settings" = the CSV export** of the current configuration (no separate backup subsystem).
4. **Mobile admin-editing limited to theme + language** — school profile / academic / numbering are edited on the web
   console (the M13/M15 mobile-is-lighter precedent).

## Runbook

Before live logo uploads, provision the private `branding` bucket (see `RUNBOOK_SUPABASE_SETUP.md §3e`).
