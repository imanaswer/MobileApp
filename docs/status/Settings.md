# Status — School Administration & Configuration (M16)

**State:** Steps 1–9 complete; awaiting milestone approval to freeze. **ADR-024 Accepted.**

## Shipped

| Area | What |
|---|---|
| DB | `SchoolSettings` + `BrandingSettings` + `SystemSettings` (3 tables), each `schoolId @unique`; no relational FK; `Locale` reused; migration `20260712070000_school_configuration`. **Zero frozen ALTER, zero drift.** |
| RLS | `settings_rls` — admin ALL on all three; any-authenticated SELECT on Branding; anon none; new private `branding` bucket. **15/15 proofs.** |
| Business | `services/settings/*` — brandingService / settingsService / configurationService; audited upserts; role-shaped read projection. |
| API | `settings.*` / `branding.*` / `configuration.*` (9 procedures); logo via `storageProcedure`; Zod inputs. |
| Mobile | `(app)/settings` — read branding/theme/language; admin edits theme+language; home nav card. |
| Web | `(app)/settings` — Administration console (branding + logo upload, school profile + numbering + academic, system + working-week, CSV export); read-only for non-admins; dashboard quick-link. |
| Tests | business +4 (permission matrix / persistence / projection / locale), api +12 transport (authz / Zod / storage precondition). |

## Permissions

One added — `settings:manage` (SA/OA). No read permission (role-shaped projection).

## Gate

lint 35/35 · typecheck 35/35 (incl. mobile) · test (business +4, api +12) · db:validate ✓ · web build 41/41 (`/settings`) ·
zero-drift ✓ · RLS 15/15. **Zero new dependency.**

## Deferred

Audit-history viewer + audit shortcut (no audit-read surface); numbering/timezone/language/academic settings stored but
read by no frozen engine in v1 (config affects future actions only); mobile admin-editing limited to theme/language;
"backup/export" = CSV export. Runbook: provision the private `branding` bucket before live logo uploads (§3e).
