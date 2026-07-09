# Feature — Examination & Assessment (M5)

Feature-specific rules. References the PRD/ADR; does not duplicate them.
Spec: M5 kickoff brief · **ADR-012 (examination & assessment)** · ADR-011
(attendance patterns reused) · ADR-010 (enrollment) · ADR-009 (report card,
future) · Dev PRD v1.3 §8.5 · `docs/milestones/M5.md` ·
`docs/PERMISSIONS_MATRIX.md`.

## Entities & ownership (ADR-012)

Marks key to **`Enrollment`, never `Student`** (ADR-010 §8) — so a result
carries its year/class/section context and CGPA can aggregate a student's
enrollments across years. The register is an `ExamSection` (the `AttendanceSession`
analog); a mark is a `Mark` (the `AttendanceRecord` analog). Five entities:

- **`Exam`** — one exam event: `(school, academicYear, ExamType, displayOrder)`
  + optional `gradeScaleId` + dates; **owns publication** (`isPublished` +
  `publishedBy/At` → Staff). `ExamType ∈ {UNIT_TEST, MONTHLY, MID_TERM,
  HALF_YEARLY, MODEL, ANNUAL, PRACTICAL, CUSTOM}`.
- **`Assessment`** — `Exam × Subject`: `maxTheory`, **nullable** `maxPractical`
  (theory-only exams), `passMark`, `displayOrder`. (PRD's `ExamSubject`; `Subject`
  is used directly — no `ClassSubject`.)
- **`ExamSection`** — the **register**: `Assessment × Section` + lifecycle
  `status` + audit actors (`createdBy/submittedBy/lockedBy` → Staff) +
  unlock audit (`unlockedBy/At/Reason`). Derived ownership (no `ownerTeacherId`).
- **`Mark`** — one enrollment's mark + its **result snapshot**:
  `theoryObtained/practicalObtained/isAbsent`, then (frozen at lock)
  `totalObtained/percentage/gradeBandId/gradeLetterSnapshot/gradePointSnapshot`.
  `@@unique(assessmentId, enrollmentId)` (the natural key — not `examSectionId`,
  so a mid-year section transfer is an in-place update, never a delete).
- **`GradeScale`/`GradeBand`** — configurable percent bands (`minPercent`,
  `maxPercent`, nullable `gradePoint`); half-open `[min,max)`; non-overlap via a
  Postgres `EXCLUDE` (btree_gist); one default scale per school (partial unique).

GPA/CGPA is **compute-on-read from snapshots** — not a table.

## Invariants (DB + business, both layers)

- **Two grains:** LOCK per `ExamSection`, PUBLISH per `Exam`. `publish` exposes
  every LOCKED section at once — **parents never see a partial exam** (DRAFT/
  SUBMITTED sections stay invisible; the visibility gate requires published
  **AND** LOCKED).
- **Lifecycle is forward-only** `DRAFT → SUBMITTED → LOCKED`; `saveMarks` is
  **DRAFT-only**. Post-publish/lock edit = **unlock → edit → lock → publish**
  (unlock requires an audited reason). No `MarkCorrection` entity.
- **Grade is snapshotted at lock** (central compute in `@repo/core/grade`,
  percentage rounded to 2 dp before band lookup). A later `GradeScale` edit
  **never mutates a locked/published result**; reads use the snapshot. GPA reads
  snapshots only; a scale without points yields `null` ("not available").
- **Cross-year integrity** is enforced at the mark boundary:
  `Mark.enrollment.academicYearId === Exam.academicYearId` (R1 — `Subject` is
  year-agnostic in the shipped model, so this is a service check, not an FK).
- **Register create is race-safe** — first `saveMarks` `ensure()`s the register
  via an `INSERT … ON CONFLICT DO NOTHING` upsert (a raw P2002 inside a tx would
  abort it and drop the loser's marks); transitions (submit/lock/unlock) are
  guarded conditional updates → `Conflict` on a lost race, no double-audit.
- **Mark limits:** obtained ≤ max (R4); a theory-only assessment rejects
  practical marks; an absent mark carries no obtained values; lock rejects an
  incomplete register (a non-absent mark left blank) or a non-absent
  percentage that hits a scale **gap** (absent marks are exempt, snapshot null).
- **Deletion guard (R5):** the definition chain is all `onDelete: Cascade`, so a
  DELETE reaching a published/locked `Exam` *would* cascade-wipe results — the
  business layer rejects deleting a published exam or one with any LOCKED
  section (guarded, audited; direct SQL bypasses it, accepted admin-only).
- **Actors are a `Staff` row** (B3 — `Staff.userId`), same as attendance. Every
  mutation writes `AuditLog` **in the same transaction**.

## Authorization (permission + ROW scope, business layer)

- Permissions: `exam:manage` (admin — exams/assessments/grade-scales + lock/
  unlock + publish + delete), `marks:enter` (save + submit), `marks:read`.
- SUPER_ADMIN + OFFICE_ADMIN: full management. TEACHER: `marks:enter` +
  `marks:read` for **own subject×section** (owns via `TeacherAssignment`); a
  register **lock** is admin-only. PARENT: `marks:read` for **own child,
  published + LOCKED only**, never edits. ACCOUNTANT: none.
- **Ownership derives from `TeacherAssignment(teacher, subject, section)`** —
  never stored; admins bypass scope. Admins hold `marks:enter` but have no
  assignment, so `mark.markable` (the teacher discovery list) is empty for them —
  they enter/oversee via the web console (`exam.registers` enumerates registers).
- RLS (defense-in-depth only — Prisma bypasses): admin ALL; teacher own subject×
  section SELECT/INSERT/UPDATE (ExamSection/Mark), own-subject/own-exam SELECT;
  parent published-own-child SELECT; GradeScale/GradeBand read-only reference;
  anon none. Proven 12/12 read + 15/15 write isolation on local Postgres.

## API

Four thin routers on `protectedProcedure`: `exam.* / assessment.* / mark.* /
gradeScale.*` (21 procedures — see `API_INVENTORY.md`). Zod inputs in
`@repo/validation` (shape only — rules stay in services). Two admin reads back
the console: `exam.get` (detail) and `exam.registers` (register oversight +
publish locked-vs-total count); `mark.markable` backs teacher discovery on
mobile.

## UI

- **Web (admin console):** `/exams/{,[examId],grade-scales}` gated on
  `exam:manage`. Dashboard = year picker + exam CRUD + **publish** (R3 confirm
  showing locked-vs-total). Detail = assessment CRUD + register oversight table +
  a **marks grid** (admin entry via `mark.save`, submit → lock → unlock-with-
  reason, CSV export). Grade-scale management (list + create-with-bands;
  append-only — edits never mutate history). Reuses the academic/attendance UI
  primitives.
- **Mobile:** teacher — markable list (assessment × section discovery) → mark
  entry (theory/practical/absent, save-draft → submit; SUBMITTED/LOCKED read-
  only). Parent — child picker → published results view + GPA. No admin CRUD.

## Tests

Business rules with mocked repositories: `mark.service.test.ts` (save ownership/
validation, submit/lock/unlock state machine, snapshot + scale-gap, parent
visibility, GPA), `mark.concurrency.test.ts` (real `Promise.all` register-create
race), `deletion.service.test.ts` (R5 guard), `exam.services.test.ts` (exam
CRUD/publish, `listExamRegisters`, assessment + `validateBands` edges,
`resolveBandsForExam`). Central compute in `@repo/core/grade.test.ts`. Transport
gates + Zod + a parameterized **authorization matrix** (every procedure × role)
in `packages/api/.../exam.test.ts`. Input schemas in
`@repo/validation/exam.test.ts`. DB constraints are the race backstop (verified
empirically in Steps 2–4). No defects surfaced in Step 9.
