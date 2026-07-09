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

**Exams / marks / report cards**
- ADR-012 — Examination & Assessment (Exam→Assessment→ExamSection→Mark on Enrollment; lock-per-register / publish-per-exam; grade snapshots; GPA from snapshots; derived ownership) — **M5, implemented**
- ADR-009 — ReportCard.examId optional + partial unique index (report cards — future)
- ADR-010 — Enrollment is the mark key (results survive promotion; CGPA aggregates a student's enrollments)
- ADR-007 — Audit log (exam/mark mutations)

**Homework (attachments)**
- ADR-004 — Private Supabase Storage + signed URLs

**Fees / payments**
- ADR-003 — Repositories as the data-access boundary
- ADR-007 — Audit log (money mutations)

**Notifications**
- ADR-005 — Notification provider abstraction

**File uploads / documents (any feature)**
- ADR-004 — Private Supabase Storage + signed URLs

**Add-on / optional features**
- ADR-006 — Feature flags for add-ons

## Cross-cutting (apply to every feature — already condensed in `.claude/project_rules.md`; open only for full rationale)

- ADR-002 — API layer + authorization model (permission + scope in the business layer)
- ADR-003 — Repository pattern (all data access)
- ADR-008 — Single-tenant now, SaaS-ready later (`schoolId` on every table)
