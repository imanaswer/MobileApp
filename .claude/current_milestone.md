# Current Milestone

**M5 — Examination & Assessment** (ADR-012, extends ADR-011)

## Current Step

**Steps 1–10 ✅ DONE — M5 COMPLETE, awaiting approval.** Step 10 (Documentation):
API_INVENTORY exams section rewritten to the shipped 21-procedure surface;
PERMISSIONS_MATRIX exam section aligned to shipped scope; new
`features/examination.md`; `status/Exams.md` → shipped; `architecture_index.md`
ADR-012 entry; new `docs/milestones/M5.md`; `project_memory.md` brought current.
No new ADR (ADR-012 covers decisions). **Surfaced:** PRD planned M5=Homework but
this project built M5=Examination — numbering reconciliation noted, unbuilt
planning-doc tags left as-is pending a renumbering decision. Totals unchanged:
business 207, api 266, validation 50; 35/35 turbo tasks.

M0–M4 frozen (critical bug/security fixes only). M4 shipped: 392 tests, web
build ✓, mobile ios export ✓.

## Scope (M5)

`Exam` (event: school/year + ExamType + displayOrder; **owns publication**),
`Assessment` (Exam × Subject — maxTheory/maxPractical?/passMark + displayOrder),
`ExamSection` (Assessment × Section — the **register**: DRAFT→SUBMITTED→LOCKED
lifecycle + unlock-audit + derived ownership; `AttendanceSession` analog), `Mark`
(per Enrollment; **result snapshot** theoryObtained/practicalObtained/
totalObtained/percentage/gradeBandId/gradeLetterSnapshot/gradePointSnapshot;
`AttendanceRecord` analog), `GradeScale`/`GradeBand` (percent bands, nullable
gradePoint). Central grade compute in `packages/core`. GPA/CGPA foundation from
snapshots only. **Marks key to Enrollment, never Student** (ADR-010).

## Out of scope

Attendance, homework, timetable, fees, notifications (incl. publish-notify —
brief overrides PRD), report cards, certificates, promotion, analytics, parent
messaging, exam attempts/re-exams (design-compatible, not built) — later
milestones.

## Roles

SUPER_ADMIN / OFFICE_ADMIN full management + publish · TEACHER enters marks +
reads own assigned (subject × section), submits/locks own sections · PARENT reads
**published** marks for own child only · ACCOUNTANT none. Ownership derives from
TeacherAssignment; RLS defense-in-depth.

## Workflow (stop after each step)

1 Requirements ✅ · 2 DB ✅ · 3 Relationships ✅ · 4 RLS ✅ ·
5 Business ✅ · 6 API ✅ · 7 Mobile ✅ · 8 Web ✅ · 9 Testing ✅ ·
10 Documentation ✅ → **M5 COMPLETE, awaiting approval**.

## Invariants (ADR-012)

Lock per ExamSection · publish per Exam (exposes all LOCKED sections; parents
never see partial) · forward-only DRAFT→SUBMITTED→LOCKED · grade/percentage
**snapshotted at lock/publish**, GradeScale edits never mutate history · GPA/CGPA
from snapshots only · ownership **derived** from TeacherAssignment (no
ownerTeacherId) · mark actor = Staff via Staff.userId bridge (B3) · cross-year
consistency enforced at **Mark.enrollment.academicYearId === Exam.academicYearId**
(Subject is year-agnostic) · unlock is audited (unlockedAt/By/Reason) · **no
MarkCorrection entity** (post-publish = unlock→edit→lock→publish) · guarded
conditional transitions (M4 pattern) · every mutation audited in-transaction.

## Naming decisions

`Assessment` (not PRD `ExamSubject`) · `Subject` directly (no `ClassSubject` —
never built) · `ExamType` enum (not PRD `category String`) · `maxPractical`
nullable (not PRD `@default(0)`). See ADR-012 vocabulary note.

## Open items / risks

- **R1** cross-year integrity rests on a service check, not a FK (Subject
  year-agnostic).
- **R2** snapshot + status transition must be one `$transaction`.
- **R3** publish-over-incomplete-exam allowed but must be an explicit admin
  choice (surface locked-vs-total count).
