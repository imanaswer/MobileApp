# Current Milestone

**M4 — Attendance Management** (kickoff 2026-07-06)

## Current Step

**Step 5 — Business Layer ✅ (5 repositories + attendance/leave/correction/
holiday services, M4 permissions, DTOs). STOPPED awaiting approval for
Step 6 — API Layer.**

## Scope (M4)

`AttendanceSession` (one marking event: year × section × date × sessionType ×
subject? × teacher), `AttendanceRecord` (session × enrollment, status
PRESENT/ABSENT/LATE/HALF_DAY/LEAVE), `LeaveRequest` (enrollment + parent,
PENDING/APPROVED/REJECTED/CANCELLED), `AttendanceCorrection` (record-level,
approval-gated), `Holiday` (year calendar). ADR-010 + ADR-011 are the
architectural source of truth. **Attendance belongs to Enrollment, never
Student.**

## Out of scope

Homework, exams, marks, report cards, fees, timetable, notifications
(absence push deferred to Notifications milestone).

## Roles

SUPER_ADMIN / OFFICE_ADMIN full management · TEACHER mark attendance +
history for sections they teach (TeacherAssignment scope), submit
corrections · PARENT view own children's attendance, submit leave requests ·
Anonymous none.

## Workflow (stop after each step)

1 Requirements ✅ (ADR-011) · 2 DB ✅ · 3 Relationships ✅ · 4 RLS ✅ ·
5 Business ✅ ·
6 API · 7 Mobile (teacher mark/history/corrections; parent
calendar/leave) · 8 Web (dashboard, bulk entry, approvals, holidays,
summary, export) · 9 Testing · 10 Documentation → deliverables report →
**STOP**.

## Invariants (enforce DB + business)

One session per (section, date, sessionType, subject) · one record per
(session, enrollment) · no attendance on holidays unless explicitly
overridden (audited) · leave approval writes LEAVE into covered
sessions + pre-fills future ones · corrections require approval, never
silent overwrites · records only for enrollments valid in the session's
year/section · all mutations audited in-transaction. M0–M3 frozen
(critical bug/security fixes only).

## Open items

Leave approval authority: PRD §8.7 wanted the class teacher, but no
isClassTeacher flag exists (deferred in M2) — M4 gives approval to
SUPER_ADMIN/OFFICE_ADMIN only (web). Working-weekday config (is Saturday a
school day?) still unconfirmed (Dev PRD §16.15) — M4 treats Mon–Fri +
Holiday table as school days pending client answer.
