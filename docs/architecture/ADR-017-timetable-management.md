# ADR-017 — Timetable Management — M9

**Status:** Proposed — **M9 Step 1 (design)** · **Date:** 2026-07-11 · **Deciders:** Architecture, Product
**Related:** ADR-002 (business layer is the authorization gate) · ADR-003 (repositories; Prisma only in `packages/db`) · ADR-006 (feature flags) · ADR-007 (AuditLog in-transaction) · ADR-008 (loose `schoolId`) ·
ADR-011/012/013 (**ownership derived from `TeacherAssignment`, never stored**; the register/derived-owner idiom reused here) · ADR-015 (ClassTeacherAssignment — **explicitly NOT a timetable-ownership source**) ·
DATABASE_CONVENTIONS (§3 anticipated `TimetablePeriod[divisionId,dayOfWeek,periodNo]`; enums, `@db.Time`, partial-unique "one default", Restrict) · PERMISSIONS_MATRIX (`timetable:manage`/`timetable:read` under the `timetable` add-on flag — adopted v1.3) · CODING_STANDARDS §1/§4 (DTOs, layering)
**Precedes:** M9 (Timetable Management) implementation — this ADR fixes the design; Steps 2–10 execute it.

---

> **Milestone framing.** This is **M9 — Timetable Management**, a new read-mostly domain over frozen M1–M8:
> period definitions, a per-year bell schedule, and a weekly section timetable that yields teacher / section /
> parent / today views. It is **purely additive** — three new tables, one new enum, two adopted permission
> constants, zero changes to any frozen table (proven by `prisma migrate diff` at Step 2). **Notifications are
> out of scope.**

## Context

An Indian school runs on a weekly **timetable**: for each section, every weekday slot maps to a subject taught
by a teacher in a room. The slots themselves are a **bell schedule** — an ordered list of numbered **periods**
with clock times, some of which are breaks. Nothing in M1–M8 models time-of-day or the weekly grid.

Three facts already in the codebase constrain the design:

1. **Ownership must derive from `TeacherAssignment(teacher, subject, section)`** — the M4/M5/M6 register idiom
   (ADR-011/012/013 §9). A timetable entry names a teacher, a subject and a section; that triple is valid **iff**
   a `TeacherAssignment` row exists for it. `ClassTeacherAssignment` (ADR-015) is the class-teacher slot and
   **must never** gate timetable ownership (the M9 brief makes this a hard rule).
2. **`timetable:manage` / `timetable:read` are already adopted** (PERMISSIONS_MATRIX add-ons, gated by the
   `timetable` feature flag; the `TIMETABLE` flag key already exists in `packages/constants`). No new *grant* is
   invented — M9 only adds the two permission *string constants* to `permissions.ts` (the matrix already assigns
   them to roles) and the services/RLS that honor them.
3. **House schema idioms** apply unchanged: enums (`Weekday`), `@db.Time` for clock times, `Restrict` on every
   data-carrying FK, loose `schoolId`, AuditLog written by the service in the same transaction.

## Decision

### 1. Three additive models — `BellSchedule`, `Period`, `TimetableEntry` — and one enum, `Weekday`

```
AcademicYear ──1:1── BellSchedule ──1:N── Period
                                             │
Section ─┐                                   │
Subject ─┼──▶ TimetableEntry ────────────────┘  (periodId)
User(teacher) ─┘        │
                        └─ weekday (Weekday enum), room?
```

**`BellSchedule`** — the day structure for a year. `id, schoolId, academicYearId, name, createdAt, updatedAt`.
`academicYear` FK **Restrict**. **`@@unique([schoolId, academicYearId])` — exactly ONE bell schedule per year.**

**`Period`** — a numbered slot within the bell schedule. `id, schoolId, bellScheduleId, name, order Int,
startTime @db.Time, endTime @db.Time, isBreak Boolean @default(false), createdAt, updatedAt`. `bellSchedule` FK
**Restrict**. `@@unique([bellScheduleId, order])` — deterministic sequence. **CHECK `startTime < endTime`**,
**CHECK `order > 0`** (raw SQL). Index `[bellScheduleId]`.

**`TimetableEntry`** — one slot of the weekly grid: `id, schoolId, academicYearId, sectionId, subjectId,
teacherId, periodId, weekday Weekday, room String?, createdAt, updatedAt`. All FKs **Restrict**; `teacher → User`
(mirrors `TeacherAssignment.teacherId`, RLS `teacherId = auth.uid()`). `academicYearId` is **denormalized** onto
the entry so section/teacher/year queries never join through `period → bellSchedule` (the same read-path
denormalization as `Mark.assessmentId`).

**`enum Weekday { MON TUE WED THU FRI SAT SUN }`** — Indian schools commonly run Mon–Sat; declaration order gives
display order.

### 2. Conflict rules — structural where possible, business-layer for the rest (STEP 5)

| Rule | Enforcement |
|---|---|
| **No section double-booking** / **no duplicate period** / **one subject & one teacher per slot** | Structural: **`@@unique([sectionId, weekday, periodId])`** — a single row *is* one subject + one teacher for that (section, weekday, period). |
| **No teacher double-booking** | Structural: **`@@unique([teacherId, weekday, periodId])`** — a teacher can't be in two sections at the same weekday+period. |
| **No overlapping periods** (within the bell schedule) | Business: `PeriodService` rejects a period whose `[startTime,endTime)` overlaps a sibling (times only; the DB CHECK already forbids `start ≥ end`). |
| **Ownership** — teacher actually teaches this subject in this section | Business: `TimetableService` asserts a `TeacherAssignment(teacher, subject, section)` exists (**never** `ClassTeacherAssignment`). |
| **Cross-year integrity** — the chosen period belongs to the entry's year's bell schedule | Business: `period.bellSchedule.academicYearId == entry.academicYearId` (the ADR-012 §10 cross-year service invariant). |
| **No class on a break** | Business: reject a `TimetableEntry` whose `period.isBreak` is true. |

The two DB uniques make the core double-booking conflicts *impossible* (a race is a DB error, not a silent
overwrite — the M4/M6 idiom); the service turns them into friendly `CONFLICT` errors and adds the
non-structural checks above. **Every mutation writes `AuditLog` in the same transaction** (ADR-007).

### 3. RLS (STEP 4) — teacher sees OWN slots; parent sees the child's WHOLE section grid

Defense-in-depth; the business layer is the real gate.

| Table | Admin | Teacher | Parent | Anon |
|---|---|---|---|---|
| `BellSchedule`, `Period` | ALL | SELECT (read-only reference) | SELECT (read-only reference) | none |
| `TimetableEntry` | ALL | **SELECT own** (`teacherId = auth.uid()`) | SELECT child's section (via `Enrollment → sectionId`) | none |

- **Deliberate asymmetry:** a **teacher** reads only their *own* rows (their personal teaching schedule — STEP 7's
  "my today / my week"); a **parent** reads the child's *entire* section grid (all teachers). This is exactly what
  STEP 4's isolation proof "Teacher A cannot read Teacher B's timetable" **forces** — teacher scope must be
  `teacherId = me` at the row level. It **narrows** the matrix's `ownDivision` for `timetable:read` (which would
  give a teacher the whole section grid); **M9 teachers get own-slots only**, no section-grid read. If product
  later wants teachers to see the full section grid, that RLS floor changes and the "A ≠ B" proof no longer holds.

### 4. Permissions — reuse the adopted `timetable:*`; NO feature-flag gate (permission-only)

- **No new permission grant.** M9 adds `TIMETABLE_MANAGE = "timetable:manage"` and `TIMETABLE_READ =
  "timetable:read"` to `packages/constants/src/permissions.ts` — the *strings* the matrix already assigns
  (manage → SA/OA; read → SA/OA + teacher own, parent own-child) — and the corresponding rows to the
  `ROLE_PERMISSIONS` policy in the same file (the map `can()` reads). Wiring an adopted matrix row, not a new grant.
- **NO feature-flag gate — timetable is core, gated by permission only.** *(Reversed after Step-1; see the note
  below.)* **Empirical finding:** there is **no `FeatureFlag` table, no flag-check code, and no consumer**
  anywhere in the repo — only dead `FEATURE_FLAGS` constant keys in `@repo/constants`. "Keeping the flag" would
  mean **building** flag infrastructure (a `FeatureFlag` table + a check helper + seed rows) that M9 never asked
  for — and that new table would appear in `prisma migrate diff`, **breaking the milestone's own "only additive
  timetable tables" proof** already shipped in Step 2. So timetable ships **permission-only**, exactly the
  **ADR-013 / M6 homework precedent** (the matrix listed homework as flag-gated; M6 shipped it core). The
  `timetable` matrix row's flag column is documentation of an intended tiering that has no runtime today.

> **Step-1 reversal (recorded).** ADR-017 as first written (and approved at the Step-1 STOP) chose to *keep* the
> `timetable` flag and seed-enable it. Step 5 discovered no flag infrastructure exists; keeping the flag would
> require net-new plumbing out of M9's scope and would contradict the Step-2 additive proof. Decision flipped to
> **permission-only**. Surfaced at the Step-5 STOP for veto before it matters (the gate would only ever have
> lived at the Step-6 procedure boundary).

### 5. Deviations from the literal STEP-1 field list (flagged for veto at STOP)

1. **No `academicYearId` column on `Period`.** The brief lists "AcademicYear" under Period's fields, but with
   BellSchedule 1:1 to the year (decision #1), a period's year is unambiguous via `bellScheduleId →
   bellSchedule.academicYearId`. A duplicated column would add a consistency invariant with **no** query benefit
   (periods are always fetched relative to their bell schedule); the denormalized `academicYearId` lives on
   `TimetableEntry` instead, where the read paths need it.
2. **One `BellSchedule` per year (dropped `isDefault` / multi-schedule).** The brief never asks for multiple
   schedules and "recurring timetable templates" is out of scope, so `@@unique([schoolId, academicYearId])` is
   the lazy correct model — it also removes any weekday→schedule resolution logic. A future "half-day" schedule
   is an additive migration (drop the unique) if ever needed.
3. **No `createdByStaffId` on `TimetableEntry`.** The brief's field list omits it; `AuditLog.actorUserId` already
   carries the actor (ADR-007). No audit-actor column on the entry.
4. **Teacher RLS narrows the matrix's `ownDivision`** (decision #3) — own-slots-only in M9.
5. **Feature flag retained + seeded** (decision #4).

## Alternatives considered

1. **Multiple bell schedules per year + `isDefault`** (mirror the ACTIVE-year / default-GradeScale idiom).
   Rejected for M9 — speculative (YAGNI); forces weekday→schedule resolution the brief doesn't ask for. Additive
   later.
2. **`weekday Int` (ISO 1–7) instead of an enum.** Rejected — the codebase models closed sets as enums; `Weekday`
   reads better in DTOs and code and is display-orderable by declaration.
3. **`Period` directly under `AcademicYear` (no `BellSchedule`).** Rejected — the brief mandates `BellSchedule`,
   and "the ordered set of periods with their times" is exactly what a bell schedule *is*; grouping periods under
   it keeps the 1:1-per-year rule expressible as a single unique.
4. **gist `EXCLUDE` for period-time overlap** (like `AcademicTerm` dates). Rejected for M9 — "every validation is
   business layer" (brief) and periods per schedule are few; a service check is simpler and the CHECK
   `startTime < endTime` already covers the structural half. Additive later if it becomes a real race.
5. **Store ownership on the entry (an `ownerStaffId`).** Rejected — violates the derived-ownership rule
   (ADR-011/012/013); ownership is the existence of a `TeacherAssignment`, resolved at authz time.
6. **Build `FeatureFlag` infrastructure and gate timetable behind the `timetable` flag** (the matrix's stated
   intent). **Rejected (decision #4, reversed from the Step-1 draft):** no flag infra exists to reuse — building
   it is out of M9's scope and its new table would break the Step-2 "only additive timetable tables" proof.
   Ship permission-only, the ADR-013/M6 precedent.

## Consequences

- (+) **Purely additive** — three new tables + one enum + two adopted permission constants; every frozen table
  untouched (proven by `migrate diff` at Step 2).
- (+) **Double-booking is structurally impossible** — two DB uniques; the service layer only translates and adds
  the non-structural checks.
- (+) **Ownership stays derived** — no `ownerStaffId`, no `ClassTeacherAssignment` coupling; one `TeacherAssignment`
  existence check.
- (+) **No new permission grant, no new RLS *policy shape*** — reuses `timetable:*` and the standard
  admin/teacher-own/parent-own-child RLS idiom.
- (−) **Teacher timetable is own-slots-only** — a teacher cannot see the section's full grid in M9 (the isolation
  proof requires it); revisit if product wants the whole-grid teacher view.
- (−) **One bell schedule per year** — a school needing a distinct half-day schedule needs a later additive
  migration.
- (−) **Backfill: none** — new domain, no existing rows; the seed creates one bell schedule + periods for the
  current year and enables the `timetable` flag.

## STOP — Step 1 boundary

This ADR fixes the design. **No migration, SQL, DTO, or UI is written here** — Step 2 (additive migration +
`migrate diff` proof) onward executes it. Three items need an explicit nod before Step 2, because they shape the
schema: **(a)** one BellSchedule per year (deviation #2), **(b)** teacher RLS = own-slots-only (decision #3), and
**(c)** keep the `timetable` flag and seed-enable it (decision #4).
