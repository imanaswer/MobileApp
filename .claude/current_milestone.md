# Current Milestone

**M2 — Academic Foundation** (kickoff 2026-07-05)

## Current Step

**Steps 1–5 ✅ — next: Step 6 (mobile read-only screens).**

## Scope (M2)

Academic structure ONLY: `AcademicYear`, `AcademicTerm`, `Class`, `Section`,
`Subject`, `TeacherAssignment`. Managed by SUPER_ADMIN + OFFICE_ADMIN; staff
read; teachers read own assignments; parents no access.

## Out of scope

Students, enrollment, attendance, marks, report cards, timetable, fees, people
records (Staff/Guardian), bulk import, class-teacher flag — later milestones.

## Workflow (stop after Step 10)

1 Requirements ✅ · 2 DB design · 3 RLS · 4 Business · 5 API · 6 Mobile (read-only)
· 7 Web (CRUD) · 8 Testing · 9 Documentation · 10 Deliverables report → STOP.

## Invariants (from the brief — enforce DB + business)

One ACTIVE year · terms don't overlap · class name unique/school · section
unique/class · subject unique/school · no duplicate (teacher, subject, section)
assignment. All admin mutations audited in-transaction. M1 frozen (critical
bug/security fixes only).
