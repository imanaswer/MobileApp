# Current Milestone

**M3 — People Management** (kickoff 2026-07-05)

## Current Step

**Steps 1–10 ✅ COMPLETE (2026-07-05) — deliverables reported; STOPPED awaiting
user approval before M4 — Attendance.** Gates: typecheck 14/14 · lint 14/14 ·
tests 20 files / 213 · web production build ✓ · mobile ios export ✓.

## Scope (M3)

`Student` (identity only), `Parent` + `StudentParent` junction (relationship
enum, single primary), `Staff` (1:1 User employment profile), `Enrollment`
(ADR-010 — owns year/class/section/rollNo, one per student per year),
`StudentDocument` (metadata; bytes in the private `student-documents` bucket,
signed URLs minted server-side per ADR-004).

## Out of scope

Attendance, homework, exams/marks, report cards, fees, timetable,
communication, bulk import — later milestones.

## Roles

SUPER_ADMIN / OFFICE_ADMIN full management · TEACHER reads students in sections
they teach (+ own staff profile; PHOTO documents only) · PARENT reads own
children (+ own parent record) · ACCOUNTANT none. Row scope lives in the
business services; RLS is defense-in-depth.

## Workflow (stop after each step)

1 Requirements ✅ (ADR-010) · 2 DB ✅ · 3 Relationships ✅ · 4 RLS ✅ ·
5 Business ✅ · 6 API ✅ (`9fded51`) · 7 Mobile ✅ (`e5b7d28`) · 8 Web ✅
(`6f17532`) · 9 Testing ✅ (`d1929eb`) · 10 Documentation ✅ → **STOP**.

## Invariants (enforce DB + business)

Admission no unique/school · Aadhaar partial-unique · one enrollment per
(student, year) · promotion = NEW enrollment, history never mutated · same-class
transfer = in-place · rollNo needs section + unique per (year, section) · one
primary contact per student · employeeId unique/school · all admin mutations
audited in-transaction. M0–M2 frozen (critical bug/security fixes only).

## Open items

Private `student-documents` bucket needs manual provisioning
(RUNBOOK_SUPABASE_SETUP.md §3b) before live document uploads.
