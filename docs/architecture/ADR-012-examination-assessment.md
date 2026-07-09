# ADR-012 — Examination & Assessment architecture (M5)

**Status:** Accepted · **Date:** 2026-07 · **Deciders:** Architecture, Product
**Related:** Dev PRD §6 (Exam/Mark/GradeScale), §8.5 · ADR-007 (audit) · ADR-009
(ReportCard exam-optional) · ADR-010 (Enrollment is the join point) · **ADR-011
(Attendance — the pattern this ADR extends)** · PERMISSIONS_MATRIX §Exams
**Precedes:** M5 (Examination & Assessment) implementation — this ADR defines the
model and the Step-1 refinements; no code is written here.

## Context

M5 is the first module with a **derived, published, immutable-after-publish**
value: a *grade*. Attendance (M4) stored the fact itself (`PRESENT`/`ABSENT`);
a mark's grade is *computed* from a `GradeScale` that can later be edited, and
becomes **parent-visible on publication**. So M5 must add two things M4 did not
need: (a) a **snapshot** of every computed result so a later scale edit cannot
mutate history, and (b) a **publication axis** distinct from the lock axis.

Everything else reuses M4/ADR-011 wholesale: a per-section register holds the
`DRAFT→SUBMITTED→LOCKED` lifecycle and derived teacher ownership; marks key to
**Enrollment, never Student** (ADR-010); every mutation is audited in-transaction
(ADR-007). The M5 kickoff brief was approved (Step 1) with the refinements below;
this ADR records them as the M5 source of truth.

**Vocabulary note.** The Dev PRD v1.3 blueprint modelled `Exam → ExamSubject →
Mark` and referenced a `ClassSubject` table that was **never built**. There is no
*shipped* exam vocabulary, so — unlike ADR-010, where shipped M2 code was the
tiebreaker — the **current M5 brief wins on naming**: the per-subject definition
is **`Assessment`** (not `ExamSubject`), and it references the shipped **`Subject`**
directly (no `ClassSubject`). The PRD supplies field *shapes*
(`maxTheory`/`maxPractical`/`passMark`, percent-band grades); shipped M2/M3
supplies the *dependencies* (`Subject`, `Section`, `TeacherAssignment.teacherId →
User`, the `Staff.userId` bridge, `Enrollment`).

## Decision

### 1. Hierarchy and grain — lifecycle on ExamSection, publish on Exam

```
Exam           event; School + AcademicYear scoped; ExamType + displayOrder;
  │            OWNS PUBLICATION (isPublished / publishedAt / publishedByStaffId).
  ▼
Assessment     Exam × Subject — the definition (maxTheory, maxPractical?, passMark);
  │            school/year-wide; displayOrder. Uses Subject directly.
  ▼
ExamSection    Assessment × Section — the REGISTER. Holds the lifecycle
  │            (DRAFT→SUBMITTED→LOCKED) + unlock audit fields + derived ownership.
  │            Direct analog of M4 `AttendanceSession`.
  ▼
Mark           per Enrollment within an ExamSection — the leaf write + result
               snapshot. Analog of M4 `AttendanceRecord`. Unique (assessment, enrollment).
```

**Lifecycle and ownership live on `ExamSection`, never on `Mark`.** One teacher
owns one section → one submit, one lock, one audit, one concurrency boundary.
Reuse M4's **guarded conditional transitions** (`updateMany WHERE status=<from>`,
loser gets `ConflictError`) verbatim.

### 2. Two axes: LOCK (per ExamSection) vs PUBLISH (per Exam)

- **LOCK** is per-`ExamSection` — immutability of that section's marks.
- **PUBLISH** is per-`Exam` — `exam.publish` exposes **every LOCKED ExamSection
  underneath** to parents at once. Parents **never see a partially-published
  exam**: a section still `DRAFT`/`SUBMITTED` at publish time simply has no
  visible marks; publishing does not force-lock. Publication is the parent-
  visibility gate.
- **Publish sends NO notification.** The PRD's `publishResults` notifies, but M5
  **excludes notifications** — the brief overrides the PRD. Publish sets state
  only.
- **Visibility gate = published AND LOCKED (both layers).** A mark is parent-visible
  only when its `Exam.isPublished` **and** its `ExamSection.status = LOCKED`.
  Enforced authoritatively in the business read (`MarkService.marksForEnrollment`,
  `GradeService.gpaForEnrollment` for parents) **and** in RLS
  (`exam_published_for_section` requires `xs.status = 'LOCKED'`). This makes unlock
  self-correcting: unlocking a section for a post-publish correction hides its
  in-flight marks until it is re-locked (Step-5 fix; the LOCKED clause closed a
  leak where a still-SUBMITTED section under a published exam showed marks).
- **The two boundaries never move.** Publication fields (`isPublished`,
  `publishedAt`, `publishedByStaffId`) live **only** on `Exam`; `ExamSection` must
  **never** gain publish fields. Lock fields (`status`, `lockedAt/By`,
  `unlockedAt/By/Reason`) live **only** on `ExamSection`; `Exam` has no lock state.
  Verified in the shipped schema (Step 2).

### 3. Immutable result snapshots on Mark

Grade is **computed centrally** (one pure function in `packages/core`;
`% = (theory+practical)/(maxTheory+maxPractical)` → band lookup) and
**snapshotted onto the Mark at LOCK** (frozen thereafter; PUBLISH re-freezes if a
legitimate audited unlock/re-lock happened in between). Snapshot fields:

```
theoryObtained · practicalObtained · totalObtained · percentage
gradeBandId (FK) · gradeLetterSnapshot · gradePointSnapshot
```

A later `GradeScale`/`GradeBand` edit **must never mutate a locked/published
result** — reads use the snapshot, not a live recompute. DRAFT preview may
compute-on-read. `gradePointSnapshot` is nullable (a scale may omit points) →
GPA degrades gracefully to "not available", never crashes. In the shipped schema
these are seven **plain columns** on `Mark` (not generated/derived) — verified
Step 2. `gradeLetterSnapshot`/`gradePointSnapshot` are the ADR field names for the
"gradeLetter/gradePoint" snapshots.

**`gradeBandId → SetNull`, and why deleting a band never touches a published mark.**
`gradeLetterSnapshot` + `gradePointSnapshot` are the **authoritative** frozen
result; `gradeBandId` is **provenance only** (which band produced it). So the FK is
`onDelete: SetNull` (proven Step 2): a Step-8 grade-scale reorganization may delete
a `GradeBand`, which nulls the *provenance pointer* on any referencing `Mark` but
**changes no visible/published value** — the letter and point stand. GradeBand is
metadata; the snapshot is the record.

### 3a. GradeBand interval strategy (grade-boundary correctness)

Bands are **half-open `[minPercent, maxPercent)`** (lower inclusive, upper
exclusive), non-overlap enforced at the DB by the `gist EXCLUDE` (proven Step 2).
Edge cases and their resolution:

- **Exactly 0%** — the bottom band must start at `minPercent = 0` (seed
  convention); `[0, x)` includes 0.
- **Exactly 100%** — half-open would drop a perfect score, so the **top band uses a
  `>100` sentinel** `maxPercent` (e.g. `100.01`); `100` then lands in
  `[90, 100.01)`. Proven Step 2.
- **Adjacent boundaries** — at a shared edge (e.g. `[70,80)` / `[80,90)`) the value
  belongs to the **upper** band; the EXCLUDE guarantees no overlap and the
  convention guarantees no ambiguity.
- **Unreachable ranges** — the `maxPercent > minPercent` CHECK forbids zero-width
  bands; with no gaps every band is reachable.
- **Gaps** — the EXCLUDE prevents overlap but **not** gaps; a complete scale must
  cover `[0,100]`. A percentage in no band is rejected at LOCK (§10 no-band-gap).
- **Floating-point precision** — `percentage`/bounds are `Float` (`DOUBLE
  PRECISION`), so a computed `%` can sit at `79.999999…` near a boundary. Mitigation
  (Step 5, business layer): **round `percentage` to a fixed precision (2 dp) before
  band lookup and before snapshotting** — the stored value and the lookup agree, so
  boundary jitter cannot flip a grade. `Float` is retained (matches the PRD and GPA
  arithmetic); **`Decimal` is the recorded upgrade path** if a future audit demands
  exact decimal semantics — not adopted now (no redesign without cause).

### 4. GPA / CGPA foundation — snapshots only

Enrollment GPA and Student CGPA operate **entirely from `Mark` snapshots**, never
from today's `GradeScale`. This is the sharpest reason marks key to Enrollment,
never Student: **CGPA aggregates a Student's Enrollments across years**
(`Mark JOIN Enrollment WHERE studentId = ?`), while a term GPA aggregates one
Enrollment's marks. M5 lays the foundation (snapshot fields present, pure
aggregation helpers); report cards consuming it are a later milestone.

### 5. ExamType — explicit enum

Replace the PRD's generic `category String` with:

```
enum ExamType { UNIT_TEST  MONTHLY  MID_TERM  HALF_YEARLY  MODEL  ANNUAL  PRACTICAL  CUSTOM }
```

`CUSTOM` is the open-ended escape hatch so a new exam kind needs no migration.

### 6. Display order

`displayOrder Int` on **`Exam`** and **`Assessment`**. UI ordering is never
alphabetical (mirrors `Class.sortOrder`).

### 7. Optional practical

`Assessment.maxTheory` required; **`maxPractical Int?` nullable** (theory-only
exams). Diverges from the PRD blueprint's `maxPractical Int @default(0)` — a null
`maxPractical` reads as "no practical component", cleaner than a 0 that could mean
"practical worth zero". The grade formula's denominator uses
`maxTheory + (maxPractical ?? 0)`.

### 8. Unlock — an audited workflow, no MarkCorrection entity

Locked marks are **never silently reopened**. Unlock is an explicit admin
workflow on `ExamSection`, tracked by `unlockedAt · unlockedByStaffId ·
unlockReason`, writing an `AuditLog` row. There is **no `MarkCorrection`
entity** (M4 had `AttendanceCorrection`; the M5 brief does not request an exam
analog). Post-publish correction is **Unlock → Edit → Lock → Publish**, every
transition audited.

### 9. Ownership derived, never stored

**No `ownerTeacherId` column.** Ownership resolves at authorization time from
`TeacherAssignment(teacherId, subjectId, sectionId)` against
`(principal.user, assessment.subjectId, examSection.sectionId)` — identical to M4.
The mark actor is a **`Staff`** (`enteredByStaffId`, B3 provisioning invariant);
ownership derives from **`User`**; `Staff.userId @unique` bridges them (same
`resolveActingStaffId` pattern as M4).

### 10. Cross-year consistency — enforced at the Enrollment boundary

Refinement #12 ("Assessment.subject belongs to the same AcademicYear as the
Exam") **cannot be checked on `Subject`**: `Subject`, `Section`, and
`TeacherAssignment` are **year-agnostic** in shipped M2 (only `schoolId`/`name`);
the sole year-scoped joins below `Exam` are `Enrollment` and `AcademicTerm`. So
the enforceable invariant is stated at the boundary that *does* carry the year:

- **`Mark.enrollment.academicYearId === Exam.academicYearId`** — a mark may only
  be entered for an enrollment in the exam's year. This is the real "reject
  cross-year references" guarantee.
- **`schoolId` consistency** across `Exam` / `Subject` / `Section` / `Enrollment`
  (validated in the service; loose refs per ADR-008).

Documented so Step 2 does not attempt a `Subject.academicYearId` check that the
schema cannot support without re-scoping a frozen M2 model.

**Business-layer invariants (enforced in Step 5 — not DB-expressible, cross-table).**
The DB enforces every *single-table* rule (CHECKs, uniques, EXCLUDE — all proven
in Step 2). Three rules cross tables and a Postgres `CHECK` cannot reference
another table, so they live in `MarkService`/`GradeService` and must be tested in
Step 9:

- **R4 — `theoryObtained ≤ maxTheory` and `practicalObtained ≤ maxPractical`.**
  The DB proves marks are non-negative; it *cannot* prove they don't exceed the
  Assessment's maximum (that's the Step-9 "invalid maximum marks" edge case).
  Without this a teacher could enter 500/80. Business-layer reject on save.
- **Section match — `mark.enrollment.sectionId === examSection.sectionId`.** A
  mark may only be entered for an enrollment in the register's section (the exam
  analog of M4's "attendance only for enrollments in the section").
- **No-band-gap — a percentage that falls in no `GradeBand` is rejected at LOCK.**
  The EXCLUDE prevents band *overlap*, not *gaps*; a complete scale must cover
  `[0,100]`. Grade compute throws on an unresolvable percentage rather than
  writing a null grade (the Step-9 "grade boundary" edge case).

### 11. Future re-exam / attempt compatibility (design-only)

**No attempt support is built in M5.** `Mark` uniqueness stays
`@@unique([assessmentId, enrollmentId])`. Compatibility confirmed for later work,
**no redesign needed**:

- **Supplementary / improvement / retest exams** — modelled today as a **new
  `Exam` → `Assessment`** (a supplementary is a distinct exam event). Fully
  supported now: it produces its own marks against its own assessment, and GPA
  aggregation already spans multiple exams via `enrollmentId`. No schema change.
- **Multiple attempts on the *same* `Assessment`** — the only case the current
  natural key forbids (by design — one result per assessment per enrollment). The
  recorded extension point: add an `attempt`/`kind` discriminator to `Mark` and
  revise the unique to `[assessmentId, enrollmentId, attempt]` (the ADR-009
  partial-index idiom). Nothing in the M5 shape blocks this.

### 12. Transfer safety — the natural key is `[assessmentId, enrollmentId]`

A mid-year **section transfer** (ADR-010 §5) mutates `Enrollment.sectionId` in
place and a new `ExamSection` exists for the destination section. The natural key
is **`@@unique([assessmentId, enrollmentId])`, never `[examSectionId, enrollmentId]`**:
the latter would let the same enrollment hold one mark in the origin register and a
second in the destination register for the *same assessment*, and GPA (gathered by
`enrollmentId`) would **double-count**. Keying on `assessmentId` makes the second
insert a race-free unique violation. `Mark` therefore carries **both** FKs —
`examSectionId` (Cascade; the lifecycle owner, so lock/unlock reliably finds its
marks even after a transfer) **and** the denormalized `assessmentId` (the natural
key + GPA integrity); the service invariant `mark.assessmentId ===
examSection.assessmentId` keeps them consistent (dual-FK idiom, ADR-010 §3).
**Delete-rule review for transfer safety (Step 2, proven):** no delete rule creates
a duplicate — `Mark→ExamSection` Cascade only *removes* marks, `Mark→Enrollment`
Restrict blocks deleting an enrollment that carries marks, and a transfer performs
**no delete at all** (it is an in-place `sectionId` update). The uniqueness holds
across the whole lifecycle.

## Alternatives Considered

- **Lifecycle/ownership per-Mark instead of per-ExamSection** — rejected: loses
  the atomic submit/lock grain, forces ownership onto every leaf row, and can't
  reuse M4's guarded-transition concurrency hardening. The register grain is what
  makes "one teacher, one submit, one audit" true.
- **Publish per-ExamSection** — rejected: parents would see partial exams as
  sections trickle in. Publish-per-Exam is the clean "all-or-nothing visibility"
  gate; lock stays per-section for teacher workflow.
- **Compute grade on read** — rejected for locked/published marks: a `GradeScale`
  edit would silently rewrite history and break CGPA reproducibility. Snapshot is
  the only correct choice; compute-on-read is retained for DRAFT preview only.
- **A `MarkCorrection` entity mirroring M4** — rejected (not requested; YAGNI).
  Audited unlock covers the need without a second entity + workflow.

## Consequences

- (+) Reuses M4/ADR-011 end to end: register lifecycle, derived ownership,
  guarded transitions, in-transaction audit, `Staff.userId` actor bridge.
- (+) Published results are **reproducible forever** — snapshots make grade/GPA
  independent of later `GradeScale` edits; CGPA-across-years falls out of the
  Enrollment key (ADR-010).
- (+) Two clean grains (lock per section, publish per exam) match real workflow
  and prevent partial-visibility leaks to parents.
- (−) Snapshots **denormalize** computed results onto `Mark`; the service must
  write them atomically at lock/publish (audited). Accepted — it is the price of
  immutability, and the write path is single-owner (the locking admin/teacher).
- (−) Cross-year consistency is a **service-layer** invariant at the enrollment
  boundary, not a FK (Subject is year-agnostic) — one more thing tests must
  cover (Step 9).
- (−) `maxPractical` nullable diverges from the PRD's `@default(0)`; documented
  here so it is a decision, not drift.

## Risk register (surfaced at Step 1)

- **R1 — Subject/TeacherAssignment year-agnostic (§10).** Cross-year integrity
  rests on the Enrollment-boundary check; a bug there is the main correctness
  risk. Mitigation: explicit service invariant + Step-9 test (mark for an
  enrollment in a different year → reject).
- **R2 — Snapshot/lock atomicity.** A partial lock (marks locked but snapshots
  not written, or vice-versa) would publish inconsistent results. Mitigation:
  snapshot + status transition in one `$transaction`; guarded transition ensures
  exactly one writer.
- **R3 — Publish over an incomplete exam.** Publishing while sections are still
  DRAFT is *allowed* (§2) but must be an explicit, visible admin choice, not an
  accident. Mitigation: publish surfaces a locked-vs-total section count; parents
  see only locked sections. **Resolved (Step 8):** `publishExam` is count-agnostic
  (it just exposes LOCKED sections); the locked-vs-total count is surfaced in the
  **web publish dialog** via `exam.registers` (`listExamRegisters`), which
  enumerates an exam's registers — admins have no `TeacherAssignment` so
  `mark.markable` is empty for them, and this is their register-discovery path.
- **R5 — Cascade could delete published data; only the business layer prevents it
  (FLAGGED).** The definition chain is `Exam → Assessment → ExamSection → Mark`
  all `onDelete: Cascade` (proven Step 2). **The database itself does not
  distinguish a published/locked exam from a draft** — a `DELETE` that reaches an
  `Exam` row *would* cascade-wipe its published marks. The **only** guard is a
  Step-5 business rule: `ExamService.delete` must reject when the exam is published
  **or** any child `ExamSection` is `LOCKED` (guarded + audited + Step-9 test).
  Consequence: a **direct SQL/admin delete bypasses the guard** — accepted (raw DB
  access is trusted, admin-only, same posture as every other table). No DB-level
  block is added: a trigger to forbid it is churn for a threat the application path
  already closes, and `onDelete: Restrict` on the chain would break *legitimate*
  draft-exam cleanup.
  **Status — CLOSED (guard implemented at Step 3).** All three delete entry points
  (`deleteExam` / `deleteAssessment` / `deleteExamSection` in
  `business/services/exam/deletion.service.ts`) route through the single canonical
  `assertExamDeletable` — refuse when the owning exam `isPublished` or any section
  is `LOCKED`, reject *before* the transaction (no audit), one audit on success.
  `exam:manage` (admin-only) gates all three. Proven by 7 unit tests
  (`deletion.service.test.ts`). Step 5 extends the same repository/guard with the
  rest of ExamService; direct-SQL remains the only (accepted) bypass.
