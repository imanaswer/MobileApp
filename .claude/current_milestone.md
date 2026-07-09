# Current Milestone

**M6 — Homework & Assignment Management** (ADR-013, extends ADR-010/011/012 + ADR-004)

## Current Step

**Step 1 (Requirements Analysis) ✅ DONE — awaiting approval before Step 2.**
Produced **ADR-013** (docs/architecture/ADR-013-homework-assignment-management.md):
entities Homework / HomeworkAttachment / HomeworkSubmission / SubmissionAttachment /
HomeworkFeedback; lifecycles `DRAFT→PUBLISHED→CLOSED` (audited reopen) and
`SUBMITTED→RETURNED→REVIEWED` (in-place resubmission, attempt counter); derived
teacher ownership; parent-actor submissions on **Enrollment, never Student**;
lateness snapshot (no cron); one new private bucket `homework-files`; permission set
+ RLS plan; edge cases + risk register R1–R6. **Surfaced:** the brief overrides the
PRD's distribution-only homework decision (#13) — submissions are core, no
`homework-uploads` flag; OA gets `homework:manage` (brief "Admin ALL" vs planned
matrix row).

**Note:** starting M6 was taken as implicit approval of M5 → M3/M4/M5 treated as
frozen (critical bug/security fixes only). Flag if that reading is wrong.

## Scope (M6)

`Homework` (Subject×Section, year-stamped; owns lifecycle + publication; ownership
derived from TeacherAssignment; content frozen at publish, dueDate extend-only),
`HomeworkAttachment` (teacher files), `HomeworkSubmission` (per **Enrollment**;
unique (homework, enrollment); Parent actor; isLate snapshot; guarded transitions),
`SubmissionAttachment` (append-only, attempt-tagged), `HomeworkFeedback` (immutable
review rounds, text-only — **no grading**). Storage via ADR-004 StoragePort +
private `homework-files` bucket. Everything audited in-tx, everything
permission+scope checked.

## Out of scope

Notifications/push, chat/discussion threads, grading/marks on homework, plagiarism,
report cards, attendance, exams, timetable — later milestones. Publish/feedback send
no notification (brief overrides PRD, M5 precedent).

## Roles

SUPER_ADMIN/OFFICE_ADMIN full management school-wide · TEACHER creates/publishes/
closes/reviews own subject×section (derived) · PARENT reads published homework for
own child + submits/resubmits for own child + reads own feedback · ACCOUNTANT none.
No student login — parents submit for children.

## Workflow (stop after each step)

1 Requirements ✅ · 2 DB ⏳ · 3 Relationships · 4 RLS · 5 Business · 6 API ·
7 Mobile (teacher create/publish/review + parent submit/resubmit/feedback — brief
overrides the read-only default) · 8 Web (dashboard, CRUD, submission table,
filters, CSV, storage upload, feedback) · 9 Testing · 10 Documentation.

## Invariants (ADR-013)

Submission keys to **Enrollment, never Student** · ownership derived from
TeacherAssignment (no ownerTeacherId) · publication = parent-visibility gate,
per-homework single grain · content frozen at publish; dueDate extend-only ·
submissions only while PUBLISHED; feedback allowed after CLOSED · unique
(homeworkId, enrollmentId) — resubmit mutates in place (attempt++), never a second
row · no resubmit after REVIEWED · isLate snapshotted at (re)submit vs IST dueDate
(no auto-close cron) · attachments/feedback append-only · section-match + year-match
+ ACTIVE-enrollment + StudentParent-link enforced in service (R1) · guarded
conditional transitions (R2) · delete only in DRAFT (R5 analog) · storage paths
server-chosen, signed after authz, `*Path` never URLs · every mutation audited
in-transaction · B3: staff/parent actor rows required (R6).

## Open items / risks

- **R1** cross-year/section integrity is service-checked, not FK.
- **R2** review-vs-resubmit concurrency → guarded (status, attempt) updates + race tests.
- **R3** parent visibility or-clause (section-match OR has-submission) — subtlest read rule.
- **R4** doubled storage-authz surface (teacher + parent files).
- **R6** B3 extends to parents (Parent.userId required to submit).
- Bucket `homework-files` provisioning = user runbook step before live uploads.
- PRD/status/feature docs still say distribution-only — corrected in Step 10.
