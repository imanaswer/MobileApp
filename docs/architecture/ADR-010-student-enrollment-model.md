# ADR-010 — Student ↔ Enrollment model (year-bound membership)

**Status:** Accepted · **Date:** 2026-07 · **Deciders:** Architecture, Product
**Related:** Dev PRD §6 (Enrollment), §8.7 · ADR-007 (audit) · ADR-008 (loose `schoolId`) · ADR-009 (ReportCard→Enrollment) · DATABASE_CONVENTIONS (lifecycle status, no soft-delete) · REVIEW_FINDINGS B6 (one current year)
**Precedes:** M3 (Students & Enrollment) implementation — this ADR defines the model; no code is written here.

## Context

M3 introduces the first **person-with-history** entity: a `Student` who moves through grades year after year, accumulating attendance, marks, report cards and fees along the way. The M2 academic structure (`AcademicYear` with a `status` lifecycle, `Class`, `Section`, `Subject`, `TeacherAssignment`) is the fixed scaffold; M3 must bind students onto it *per year* in a way that four later modules can all hang off.

**Vocabulary reconciliation (read this first).** The Dev PRD spec'd this area under earlier names — `ClassLevel`, `Division`, and an `AcademicYear.isCurrent` boolean. The **shipped M2 code** renamed these to **`Class`**, **`Section`**, and **`AcademicYear.status`** (enum `PLANNED → ACTIVE → CLOSED`, with a partial unique index guaranteeing exactly one `ACTIVE` year per school). The rename is systematic across all three. Because Enrollment is *unbuilt* (M3), there is no shipped Enrollment code to diverge from — so this ADR takes the **shape** from the Dev PRD's `Enrollment` blueprint but uses the **shipped M2 vocabulary** throughout (`Class`/`Section`/`ACTIVE` year). Existing M2 design (shipped schema + `current_milestone.md`) is the tiebreaker the task names, and both use `Class`/`Section`. If the team actually intends to keep the PRD names in M3, that is the one thing to correct before building.

The problem is *where placement and history live*. Placing a student's grade/section directly on the `Student` row is the naïve default; it cannot answer "which section in 2025–26?" once the student advances, and it makes promotion a destructive overwrite. So the domain needs a distinct year-scoped membership record — **`Enrollment`** — and we must decide its relationships, its lifecycle, and how mid-year and year-boundary movements are modelled so that attendance/marks/report-cards/fees join to something stable.

## Decision

Introduce **two entities**: a persistent `Student` (identity) and a year-bound `Enrollment` (membership + lifecycle). Everything time-scoped joins to **`Enrollment`, never to `Student`.**

```
Student (identity, persists across years)
  └─< Enrollment (one per academic year — the join point)
         ├─ academicYearId → AcademicYear   (which year)
         ├─ classId        → Class           (which grade)
         ├─ sectionId      → Section          (which parallel group)
         ├─ status          EnrollmentStatus  (lifecycle)
         └─< Attendance / Mark / ReportCard / (Invoice)   [M3+ modules]
```

### 1. Student ↔ Enrollment — one-to-many

`Student` holds only **identity that outlives any year**: `admissionNo` (unique per school), name, DOB, guardians, `schoolId` (loose — ADR-008). It carries **no grade/section/year** columns. `Enrollment` holds the **year-scoped placement + status**. One `Student` has many `Enrollment` rows — one per academic year they attend.

*Why split:* a person is not their current grade. Keeping placement off `Student` is what makes promotion non-destructive and history queryable — a student's whole trajectory is `SELECT * FROM Enrollment WHERE studentId = ? ORDER BY year`.

### 2. Enrollment ↔ AcademicYear — FK, one row per student per year

`Enrollment.academicYearId → AcademicYear`, `onDelete: Restrict` (an enrolled year cannot be deleted; it carries attendance/marks). The core invariant:

```
@@unique([studentId, academicYearId])   // one enrollment per student per year
```

"Current enrollment" resolves through the **`ACTIVE` `AcademicYear`** (M2's status enum + partial unique index guarantee exactly one), *not* through a per-enrollment "current" flag. Leave→attendance resolution (§8.7), the absence job, and promotion all key off that single ACTIVE year — one source of truth, no second flag to keep consistent.

### 3. Enrollment ↔ Section — FK, and Enrollment carries `classId` too

`Enrollment.sectionId → Section` and `Enrollment.classId → Class`, both `onDelete: Restrict`. We **carry both** even though `Section` already has a `classId` parent, for three reasons:

- It follows the Dev PRD's `Enrollment` shape (which carried both `classLevelId` and `divisionId`) — *aligning* means following the blueprint, not trimming it.
- It makes the lifecycle operations clean **field-level diffs** (below): transfer touches `sectionId` only; retention is detectable by *unchanged* `classId`.
- `ADMITTED` status implies an enrollment may exist **before a section is assigned** (`sectionId` nullable at that stage). If section can be null, class **cannot** be derived from it, so `classId` must be its own (non-null) column.

`@@index([academicYearId, sectionId])` serves the hot path: "roster for this section this year." The business/repository layer keeps `classId` consistent with `section.classId` on every write (a service invariant, audited), so the denormalization can't drift.

### 4. Promotion between years — new row, never mutate the old

Year-end promotion is a **bulk create of next-year Enrollments**, run once the outgoing year closes (`PromotionWizard`, dry-run + per-row overrides — SCREEN WEB-PRO-01):

- The outgoing `Enrollment.status` becomes terminal **`PROMOTED`** (or `RETAINED`/`DROPPED` per override). Its `classId`/`sectionId` are **never touched** — the historical row stays exactly as it was lived.
- A **new** `Enrollment` row is created for the next `AcademicYear` with the next `classId` (+ section, or null pending assignment), `status = ACTIVE`.
- Entire batch runs in `prisma.$transaction` with an `AuditLog` row (ADR-007). `promoteBulk` is idempotent/keyed on `(studentId, targetYearId)` so a retry can't double-enroll.

This is the whole reason placement lives on `Enrollment`: 2025–26's attendance and marks must stay attached to the 2025–26 row untouched while the student moves into a fresh 2026–27 row.

### 5. Section transfer during the year — in-place mutation of `sectionId`

A mid-year A→B move is an **in-place update of the *same* Enrollment row's `sectionId`** (audited), **not** a second row. The `@@unique([studentId, academicYearId])` invariant forbids two enrollments in one year, so a second-row model is not available — and the OFFLINE_STRATEGY doc already assumes enrollments "change division" in place. `classId` stays unchanged (a transfer is within a grade). The audit row is the record of the move.

**The non-obvious cost, stated plainly:** because `Attendance`/`Mark` join through `Enrollment` and read its *current* `sectionId`, after a transfer **section-scoped historical reports re-attribute pre-transfer records to the new section.** Per-*student* records are unaffected (they follow `enrollmentId`/`studentId`), and a point-in-time roster ("who was in 5-A on 2026-08-01") reconstructs from the `AuditLog` of the `sectionId` change. We accept this: mid-year transfers are rare, per-student correctness is what matters for parents/report cards, and the alternative (date-ranged section membership) is disproportionate — see Alternatives.

### 6. Historical enrollments — rows kept, lifecycle by status enum

Past years are simply **past Enrollment rows, immutable after their year closes.** There is **no `deletedAt`/soft-delete column** (DATABASE_CONVENTIONS): lifecycle is a status enum that carries *why/when* a student left a state, which a boolean cannot:

```
enum EnrollmentStatus { ADMITTED  ACTIVE  PROMOTED  RETAINED  TRANSFERRED  DROPPED  ALUMNI }
```

`onDelete: Restrict` on every relation into Enrollment blocks deletion of anything carrying attendance/marks/money; a student who leaves gets `DROPPED`/`ALUMNI`, not a deleted row.

### 7. Repeating a year (retention) — new row, **same** `classId`

Retention is structurally identical to promotion — a new Enrollment for the new `AcademicYear` — with one difference: the new row's **`classId` equals the previous row's `classId`** (same grade again). The outgoing row is marked `RETAINED`. This works precisely because uniqueness is `(studentId, academicYearId)`, **not** `(studentId, classId)` — repeating Grade 5 in a new year is a distinct, legal enrollment. "Did this student repeat?" is then a direct `classId` comparison between consecutive rows, not a join through sections.

### 8. How M3+ modules depend on Enrollment

Every time-scoped record FKs to **`Enrollment.id`**, making Enrollment the single join point between a student and everything year-bound:

| Module | Link | Note |
|---|---|---|
| **Attendance** | `Attendance.enrollmentId` | upsert on `[enrollmentId, date, period]` (period non-null sentinel `0`); idempotent for offline replay |
| **Exams / Marks** | `Mark.enrollmentId` | a student's marks for a year gather by `enrollmentId` |
| **Report Cards** | `ReportCard.enrollmentId` | ADR-009 (examId optional, partial unique when exam-bound) |
| **Fees** | `Invoice.enrollmentId` (flagged add-on) | fee structure resolves by `classId` of that year's enrollment |

This dependency is the **architectural justification for the entire model**: because four modules join through `enrollmentId`, that row must be (a) **per-year** — so 2025–26 attendance never re-points when the student advances — and (b) **stable within its year** — which is exactly why promotion creates a new row (§4) and transfer mutates in place (§5). Get Enrollment's shape right and the four downstream modules need no special-casing.

## Alternatives Considered

**A. Placement columns on `Student` (grade/section/year on the person row) — REJECTED.**
Simplest to write, but it **cannot represent history**: promotion overwrites the only copy, so "which section last year?" is unanswerable and attendance/marks can't be tied to a specific year's placement. Fails topics 4–8 outright. This is the anti-pattern the whole ADR exists to avoid.

**B. Enrollment with `sectionId` only, derive `class` via `section.classId` — REJECTED as the default, kept as the fallback.**
Fewer columns and no denormalization to keep consistent. But it **diverges** from the Dev PRD's two-FK blueprint (so it needs its own justification, which "align with M2" doesn't give it); it **breaks if `sectionId` is ever null** (the `ADMITTED`-before-placement case — you then can't derive class at all); and it turns retention-detection (§7) into a join through `Section` instead of a field compare. Correct *only* if the team guarantees `sectionId` is non-null from creation — then adopt this and drop `classId`. Recorded as the clean fallback, not the recommendation.

**C. Multi-row-per-year with date-ranged section membership (a `SectionMembership` child of Enrollment, `[from,to)` ranges) — REJECTED (YAGNI).**
This is the "correct" model *if* precise point-in-time section history is a product requirement — it makes §5's re-attribution problem disappear. But it **contradicts the `@@unique([studentId, academicYearId])` invariant** the whole design rests on, adds a table + range-overlap constraints for a rare event (mid-year transfer), and the point-in-time answer we actually need is already recoverable from the `AuditLog`. Premature; noted as the extension point if transfer-history reporting ever becomes a real requirement.

**D. Soft-delete (`deletedAt`) instead of a status enum — REJECTED.**
A boolean/timestamp delete flag loses *why* a student left (promoted vs dropped vs alumni vs transferred). The status enum carries that meaning and is the established codebase convention (DATABASE_CONVENTIONS); `Restrict` + status is how every data-bearing table in this schema models lifecycle.

## Consequences

- (+) **History is first-class**: a student's full trajectory is one indexed query over immutable per-year rows; promotion and retention are non-destructive by construction.
- (+) **One join point** (`enrollmentId`) for Attendance, Marks, Report Cards, Fees — no per-module placement logic, and year-scoping is automatic.
- (+) **Consistent with M2 & the codebase**: reuses the `ACTIVE`-year invariant, the loose-`schoolId` convention (ADR-008), status-enum-not-soft-delete, in-transaction audit (ADR-007), and the ADR-009 `ReportCard→Enrollment` link.
- (+) Lifecycle operations are legible field diffs: transfer = `sectionId`; promotion = new row + new `classId`; retention = new row + same `classId`.
- (−) **Mid-year section transfer re-attributes prior section-scoped records** to the new section (§5); point-in-time roster needs `AuditLog`, not a live query. Accepted for a rare event; upgrade path is Alternative C.
- (−) `Enrollment.classId` is **denormalized** from `section.classId`; the service must keep them consistent on write (audited invariant). Accepted for the null-section case and the cleaner diffs; Alternative B is the fallback if `sectionId` is made mandatory.
- (−) Promotion/transfer/drop are **audited, transactional mutations** — more service machinery than a naïve overwrite, but required for correctness and the change history the product promises.
```

