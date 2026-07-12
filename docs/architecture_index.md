# Architecture Index — feature → ADR map

Use this to locate the correct ADR without opening every ADR.
It does **not** duplicate ADR content; open an ADR only when its decision is directly relevant.
All ADRs live in `docs/architecture/`.

## By feature

**Authentication / sessions / profiles**
- ADR-001 — Authentication via Supabase Auth
- ADR-002 — Single tRPC API with application-enforced authorization
- ADR-007 — Audit log (role/user/status mutations)

**Students / enrollment**
- ADR-010 — Student ↔ Enrollment model (year-bound membership; promotion/transfer/retention)
- ADR-003 — Repositories as the data-access boundary
- ADR-007 — Audit log (enrollment mutations)

**Attendance / leave / corrections / holidays**
- ADR-011 — Attendance data ownership (Session/Record on Enrollment; leave, corrections, working-day calendar)
- ADR-010 — Enrollment is the join point (attendance keys to Enrollment, not Student)
- ADR-003 — Repositories as the data-access boundary
- ADR-007 — Audit log (attendance/leave/correction mutations)

**Homework**
- ADR-013 — Homework & Assignment Management (Homework[Subject×Section, year-stamped]→HomeworkAttachment / HomeworkSubmission[per Enrollment, unique]→SubmissionAttachment[append-only] / HomeworkFeedback[immutable, text-only]; DRAFT→PUBLISHED→CLOSED + audited reopen; §7 submit invariants; §10 parent or-clause; derived ownership; private `homework-files` bucket, ADR-004) — **M6, implemented**

**Class teacher management**
- ADR-015 — Class Teacher Assignment (`ClassTeacherAssignment`: year×section → ONE teacher; dedicated model, NOT a `TeacherAssignment` flag; in-place replace [ADR-010 §5], never a 2nd row; `teacherId→User`, `createdByStaffId→Staff`; managed under `academic:manage`; RLS admin-all/teacher-own) — **M6.5, implemented**

**Exams / marks / report cards**
- ADR-012 — Examination & Assessment (Exam→Assessment→ExamSection→Mark on Enrollment; lock-per-register / publish-per-exam; grade snapshots; GPA from snapshots; derived ownership) — **M5, implemented**
- ADR-009 — ReportCard.examId optional + partial unique index (the deferral seam **realized by M7/ADR-014**)
- ADR-010 — Enrollment is the mark key (results survive promotion; CGPA aggregates a student's enrollments)
- ADR-007 — Audit log (exam/mark mutations)

**Report card management**
- ADR-014 — Report Card Snapshot Ownership (`ReportCard` **Enrollment-owned**; `kind` EXAM/TERM/ANNUAL discriminator + nullable `examId`/`termId` scope, per-kind partial-uniques; lifecycle `DRAFT→SUBMITTED→APPROVED→PUBLISHED` + `SUPERSEDED`/`REVOKED`; **snapshot frozen at APPROVE** — attendance %/rank/GPA; correction = **new version** (option B, supersede-then-publish in one tx); class-teacher remark authorship via `assertClassTeacherOfEnrollment` [ADR-015]; stored-PDF path [ADR-004]; audit in-tx [ADR-007]) — **M7, implemented**

**Homework (attachments)**
- ADR-004 — Private Supabase Storage + signed URLs

**Fees / payments**
- ADR-003 — Repositories as the data-access boundary
- ADR-007 — Audit log (money mutations)

**Analytics / reporting**
- ADR-022 — Analytics & Reporting (read-only analytics/dashboards over frozen M1–M13; **compute-on-read** aggregates; **no new tables, no new permission** — reuses each domain's existing read + scope, with an admin guard for school-wide panels; new read-only repo aggregates `invoice.aggregateForSchool`, `enrollment.countByYear`/`listByYear`, `attendanceRecord.statusCounts`; reuses `attendanceSummary`/`gpaForEnrollment`/`mapInvoice`; Recharts on web + hand-rolled on mobile; CSV export client-side) — **M14, implemented**
- ADR-003 — Repositories as the data-access boundary

**Notifications**
- ADR-005 — Notification provider abstraction

**File uploads / documents (any feature)**
- ADR-004 — Private Supabase Storage + signed URLs
- ADR-023 — Documents, Certificates & Downloads (per-student issued-document center over frozen M1–M14; **two additive tables** `Document`/`DocumentTemplate`, new private bucket `documents` with **60s** signed URLs; **distinct from M3 `StudentDocument`** KYC store; lifecycle GENERATED/UPLOADED→APPROVED→ARCHIVED with **APPROVED-only** visibility for teachers/parents; **generation metadata-first** — `snapshotJson` freezes issue-time values (ADR-014 snapshot philosophy), no PDF renderer, rendering deferred; three new permissions `document:manage`/`approve`/`read`; every mutation audited) — **M15, implemented**

**Add-on / optional features**
- ADR-006 — Feature flags for add-ons

## Cross-cutting (apply to every feature — already condensed in `.claude/project_rules.md`; open only for full rationale)

- ADR-002 — API layer + authorization model (permission + scope in the business layer)
- ADR-003 — Repository pattern (all data access)
- ADR-008 — Single-tenant now, SaaS-ready later (`schoolId` on every table)
