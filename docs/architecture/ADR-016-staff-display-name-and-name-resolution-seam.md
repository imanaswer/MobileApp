# ADR-016 — Staff display name & the name-resolution seam — M8

**Status:** Accepted — **M8 implemented** (Steps 1–9; awaiting milestone approval) · **Date:** 2026-07-11 · **Deciders:** Architecture, Product
**Related:** ADR-002 (business layer is the authorization gate) · ADR-003 (repositories) · ADR-008 (loose `schoolId`) ·
ADR-010 (Enrollment/year model) · ADR-012/013/014 (read-DTO + derived-ownership patterns reused) · ADR-015 (Class Teacher — the first consumer of a teacher display name) ·
Dev PRD §5 (RBAC — no new permission) · DATABASE_CONVENTIONS (camelCase, additive migrations, no soft-delete) · PERMISSIONS_MATRIX · CODING_STANDARDS §1/§4 (DTOs, layering)
**Precedes:** M8 (Identity, Names & App Experience Hardening) implementation — this ADR fixes the decision; Steps 2–9 execute it.

---

> **Milestone framing.** This is **M8 — Identity, Names & App Experience Hardening**, a hardening milestone
> that closes review findings F1–F8 (no new domain feature). This ADR governs the identity/name findings
> (F2/F3/F4/F5) and the locale-wiring seam (F8). The app-shell (F6), mobile-home (F1/F7), and scroll fixes
> are UI work that needs no ADR.

## Context

Every person entity carries a human name **except `Staff`**: `Student.firstName/lastName`, `Parent.name`, and
`User` (the identity row) has **no** name field either. So a teacher has no display name anywhere — surfaces
fall back to `employeeId` ("Employee E-12") or a raw `userId` cuid ("You" / `cml…`). This blocks:

- **F2** — class-teacher rosters, teacher-profile lists, and web teacher pickers show ids, not names.
- **F3/F4** — report-card student/exam/term labels render raw cuids because the *name* is never joined into the read DTO.
- **F5** — a parent (no `academic:read`) sees raw `classId`/`sectionId` cuids in their child's enrollment history.

Two orthogonal problems: **(1)** there is no stored teacher name; **(2)** even where names exist (Student, Class,
Section, Exam, Term), they are never *joined into the DTO the screen reads* — the screens hold ids and have no
name map. Both must be solved without unfreezing M1–M7.

## Decision

### 1. Add `Staff.name String` — one field, on `Staff`, not on frozen `User`

- **One `name` field, not first/last.** Indian names do not split cleanly into given/family; a single free-text
  `name` (e.g. "Anaswer Rajan", "Dr. K. Meera") is correct and matches `Parent.name`. No forced first/last split.
- **On `Staff`, not `User`.** `User` (the Supabase-auth identity row) is frozen and is not a profile store; the
  employment/profile row `Staff` already carries `department`/`qualification`/`bio`/`photoPath`. `name` is a
  profile attribute → it belongs on `Staff`. This keeps the change to **one additive migration on `Staff`** — the
  single frozen-table change pre-approved for M8 (freeze protocol). Every other frozen table is untouched
  (proven by `prisma migrate diff` frozen-HEAD→schema showing only the `Staff` ALTER).
- **Teacher display resolution = `userId → Staff.name`; `employeeId` is the secondary label.** All teacher refs
  in the app store a `userId` (`TeacherAssignment.teacherId`, `ClassTeacherAssignment.teacherId`, report-card
  actors). The display name is resolved by `userId → Staff.name`; `employeeId` remains as the disambiguating
  secondary label. A user with no Staff row (should not happen for a teacher — B3) resolves to a stable fallback.
- **`NOT NULL` after backfill.** `name` is required going forward. The migration adds it nullable, backfills
  existing rows (from seed/import data where available, else `'Staff ' || "employeeId"`), then `SET NOT NULL` —
  one migration. The M3 staff create/import path and the seed are updated to require `name`.

### 2. DTO enrichment is the display-label seam — names are joined SERVER-SIDE at read time

The load-bearing rule (CODING_STANDARDS §4, ADR-002): **a screen renders the label it is handed; it never
resolves ids to names itself.** The name join happens **in the business-layer read service** that already owns
the row's scope, and lands as a new field on the existing read DTO. No Prisma in routers; transport stays
`validate → delegate`; **no N+1 client-side lookup maps** (the anti-pattern this ADR deletes from F5).

Enrichments (all additive, read-time, frozen snapshot columns untouched):

| DTO / read | New field(s) | Joined from | Consumer |
|---|---|---|---|
| `ClassTeacherAssignmentDto`, `StaffDto` | `teacherName` / `name` | `Staff.name` (via `userId`) | F2 rosters/pickers |
| `reportCard.listForSection` rows + section roster | `studentName` (+ keep `rollNo`) | `Student.firstName/lastName` (via enrollment) | F3 |
| `ReportCardDto` | `examName`, `termName`, `classTeacherName` (all `string \| null`) | `Exam.name` / `AcademicTerm.name` / `Staff.name` at read time | F4 + remark byline |
| `enrollment.listByStudent` rows | `className`, `sectionName` | `Class.name` / `Section.name` | F5 (parent, **no `academic:read`**) |

- **F5's key property:** the label join happens **inside the already-parent-scoped enrollment read**, not via the
  academic router — so a parent gets class/section labels **without** holding `academic:read`. No permission or
  RLS change; the enrollment service already authorizes the row, and reading a class/section *name* for a row the
  caller can already see is a label lookup, not an academic-structure grant.
- **New procedures:** none required — every enrichment rides an existing read. (If a future label need cannot
  compose with an existing read, add a procedure per the M7 `reportCard.listForSection` precedent and document why.)
- **`examName`/`termName` are `null` for kinds that lack that scope** (an ANNUAL card has neither; a TERM card has
  no exam) — the frozen `examId`/`termId` columns already encode this; the name is `null` iff the id is `null`.

### 3. Locale wiring seam (F8) — wire only, do not translate

`User.locale` (EN/ML) is stored but never read; `LocaleProvider` is mounted with a hardcoded `locale="en"` in
mobile and web imports `@repo/i18n` zero times. **M8 wires the seam only:** both apps pass `me.locale ?? "en"`
(from the authenticated `auth.me` profile) into `LocaleProvider`, so the locale flows from the DB to the provider.
Translating the catalog (the 3-key dictionary → real EN/ML strings) is explicitly a **later milestone** — this ADR
only makes the wire exist so that milestone is a catalog change, not a plumbing change.

## Alternatives considered

1. **Name on `User`.** Rejected — `User` is the frozen auth-identity row, not a profile store; adding a profile
   field there widens the frozen surface and mixes identity with profile. `Staff` already is the teacher profile.
2. **`firstName`/`lastName` on `Staff`** (mirror `Student`). Rejected — forces a split that Indian names resist;
   `Parent.name` already set the single-field precedent for adults.
3. **Client-side name maps** (fetch all staff/classes/sections, build a `Map` in the component). Rejected — this
   is the F5 anti-pattern: N+1-ish over-fetch, leaks ids the caller may not be scoped for, duplicates join logic
   per screen, and breaks the parent case (a parent cannot list classes). The join belongs in the scoped service.
4. **A generic `displayName(userId)` resolver procedure.** Rejected for M8 — a per-id round trip is the N+1 the
   DTO-enrichment seam avoids; enrichment on the existing read is one query, already scoped.
5. **Translate the i18n catalog now.** Out of scope (F8 is wiring-only) — deferred to a later milestone.

## Consequences

- (+) **One additive frozen-table change** (`Staff.name`), everything else additive DTO fields — freeze protocol honored, proven by `migrate diff`.
- (+) **No new permission, no RLS change** — existing `staff:*` / enrollment scopes cover the new column and the label joins; parents get labels without `academic:read`.
- (+) **Names resolve once, server-side** — no client lookup maps, no id leakage, consistent labels across mobile + web.
- (+) **Locale seam exists** — a later milestone translates catalogs without touching plumbing.
- (−) **Backfilled names are placeholders** (`Staff <employeeId>`) until real names are entered — acceptable; the field is now required for new/edited staff, so real data accrues.
- (−) **Read services do a small extra join** per enriched read — bounded (section-size / a student's cards), not a hot path; mirrors the M7 snapshot/name joins.

## STOP — Step 1 boundary

This ADR fixes the decision. **No migration, DTO, or UI is written here** — Step 2 (migration) onward executes it.
