# Current Milestone

**M4 — Attendance Management** (ADR-011)

## Current Step

**Steps 1–10 ✅ COMPLETE — deliverables reported; STOPPED awaiting user approval
before M5 — Homework & Assignments.** Gates: typecheck ✓ · lint ✓ · tests 392
(business 155, api 154, validation 33, auth 32, core 8, web 7, utils 3) · web
production build ✓ · mobile ios export ✓ · migrations drift-checked + constraints/
delete-rules/RLS proven on local Postgres.

## Scope (M4)

`AttendanceSession` (register event: year/section/subject?/type/date + lifecycle
+ audit actors), `AttendanceRecord` (one mark per session×enrollment;
PRESENT/ABSENT/LATE/HALF_DAY/LEAVE), `LeaveRequest`, `AttendanceCorrection`
(immutable), `Holiday` (working-day calendar), and a compute-on-read
`AttendanceSummary`. **Attendance keys to Enrollment, never Student** (ADR-011).

## Out of scope

Homework, exams/marks, report cards, fees, timetable, notifications
(absence-push), scheduled %-rollups, subject/period attendance UI — later
milestones.

## Roles

SUPER_ADMIN / OFFICE_ADMIN full management · TEACHER marks + reads own sections,
submits corrections · PARENT reads own children, applies for leave · ACCOUNTANT
none. Ownership derives from TeacherAssignment; row scope in the business
services; RLS defense-in-depth.

## Workflow (stop after each step)

1 Requirements ✅ (ADR-011) · 2 DB ✅ · 3 Relationships ✅ · 4 RLS ✅ ·
5 Business ✅ · 6 API ✅ · 7 Mobile ✅ · 8 Web ✅ · 9 Testing ✅ ·
10 Documentation ✅ → **STOP**.

## Invariants (enforce DB + business)

One register per (section, date, type, subject) · one mark per (session,
enrollment); marking idempotent + DRAFT-only · lifecycle forward-only
DRAFT→SUBMITTED→LOCKED · attendance only for ACTIVE enrollments in the section ·
no attendance on a holiday · approved leave biases the default, never
eager-writes · corrections immutable, approval updates the record once ·
guarded transitions (no double-audit under concurrency) · every mutation audited
in-transaction. M0–M3 frozen (critical bug/security fixes only).

## Open items

- **Holiday = hard block, no override in M4** — needs sign-off (ADR-011 §9).
- Daily-session teacher scope is section-level (class-teacher flag deferred).
- Deferred: absence-push, scheduled %-rollups, subject/period UI, batched
  section-summary endpoint.
