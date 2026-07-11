# Project Memory — School Management Portal

_The single always-load file. Keep under 2 pages. Update when a step completes._

## Current Milestone

**M7 — Report Cards & Academic Results** (ADR-014; the academic reporting layer over
M3–M6). `ReportCard` Enrollment-owned, `kind` EXAM/TERM/ANNUAL; lifecycle
`DRAFT→SUBMITTED→APPROVED→PUBLISHED` (+ SUPERSEDED/REVOKED); snapshot (attendance %,
rank, GPA) frozen at APPROVE; correction = new version (supersede-then-publish, one tx);
class-teacher remark via ADR-015. **M7 Steps 1–10 COMPLETE — awaiting approval.** (M6.5
Class Teacher Management, ADR-015, also complete — the dependency M7 consumes.) History below.

<details><summary>Prior milestone — M6 Homework & Assignment Management</summary>

**M6 — Homework & Assignment Management** (scope = Homework + HomeworkAttachment +
HomeworkSubmission (per **Enrollment**, never Student) + SubmissionAttachment +
HomeworkFeedback; ADR-013 extends ADR-010/011/012 + ADR-004 storage. Lifecycles:
homework `DRAFT→PUBLISHED→CLOSED` (audited reopen), submission
`SUBMITTED→RETURNED→REVIEWED` (in-place resubmit, attempt counter). Parents submit
for children — no student login. **Brief overrides PRD decision #13:** submissions
are core, not distribution-only, no `homework-uploads` flag). **Numbering:** M6
here = PRD-planned homework milestone, shifted by the M5 renumbering.

</details>

## Current Step

**M7 Steps 1–10 COMPLETE — full milestone shipped, STOPPED awaiting approval.**
DB (Steps 2–3): migration `20260710000000_homework_management` (5 models, 2 enums,
8 CHECKs; 22/22 constraint proofs; 11/11 relationship probes, 17/17 FK rules exact).
RLS (Step 4): `20260710010000_homework_rls` (**28/28** read+write isolation proofs).
Business (Step 5): `packages/business/services/homework` — lifecycle, derived
ownership, §7 invariants, §10 parent or-clause, storage mints; 5 repositories;
5 permissions. API (Step 6): `homework`/`submission` routers (25 procedures) +
validation. Mobile (Step 7): `apps/mobile/.../homework` (text loop + download).
Web (Step 8): `apps/web/app/(app)/homework` console with **full teacher+parent file
upload/download**. Testing (Step 9): **85 tests** (incl. R2 race, R4 download-authz,
R6 clean-error); storage to the M3 mock-`StoragePort` bar. Docs (Step 10): feature/
status/PERMISSIONS_MATRIX/API_INVENTORY/architecture_index/RUNBOOK §3c/ADR-013 status
synced; PRD distribution-only scope corrected.
**Deviations shipped:** parent upload path keyed by homeworkId/enrollmentId/attempt
(not submissionId, §9) for atomic submit; mobile upload web-only; OFFICE_ADMIN
web-create-from-scratch picker unbuilt (service supports it). **Runbook-gated:** the
real byte upload→download round-trip against a provisioned `homework-files` bucket is
a one-time manual check (`RUNBOOK_SUPABASE_SETUP.md §3c`) — not runnable in CI.
M6 kickoff was read as implicit approval of M5 → M3/M4/M5 frozen.

## Completed

- ✓ **M0** — Foundation (Turborepo, 12 packages, web+mobile shells, CI) — **FROZEN**
- ✓ M1 Step 1 — Requirements analysis
- ✓ M1 Step 2 — Auth DB design (User, UserStatus, DeviceToken, AuditLog, School enums) + init migration
- ✓ M1 Step 3 — Authorization design (permission + scope, `ScopeRule` extension point)
- ✓ M1 Step 4 — Auth architecture (Supabase clients, JWT verify, context→Principal, activation)
- ✓ M1 Step 5 — API layer (`auth.me`, `auth.registerProfile`)
- ✓ M1 Step 6 — Business layer (`updateProfile`, `setRole`, `disableUser`, `enableUser` + audit-in-tx)
- ✓ M1 Step 7 — Mobile auth (splash/gate/login/OTP/session/logout/role shell)
- ✓ M1 Step 8 — Web auth (login/forgot/OTP/protected layout/middleware/logout/dashboard)
- ✓ Workflow — Intelligent context loading system (`.claude/START_HERE.md` router + `docs/architecture_index.md`; docs only, no code changed)
- ✓ M1 Step 9 — Security review (`docs/SECURITY_REVIEW_M1.md`): fixed OTP `shouldCreateUser:false` (SMS-pumping/user-creation hole) + added web security headers; Supabase dashboard config checklist pending provisioning
- ✓ M1 Step 10 — Tests: 7 suites / 80 tests (auth 22, business 20, api 14, core 8, web 7, validation 6, utils 3). **Caught+fixed critical bug:** `mapDomainErrors` (`packages/api/src/trpc.ts`) was dead code — tRPC v11 `next()` returns a result, never throws — so business `DomainError`s surfaced as 500s; now remaps `error.cause` to typed codes (frozen-module amendment, allowed as critical bug)
- ✓ M1 Step 11 — Documentation: `API_INVENTORY.md` auth section (implemented, gates, 6 procedures), `API_CONVENTIONS.md` §6 error-mapping nuance, `features/authentication.md` + status/milestone docs synced; no new ADR
- ✓ **M1 approved & frozen** (2026-07-05)
- ✓ **M1.5 — Infrastructure Provisioning**: live Supabase project (`wupcsvbyrknfuuskzuzp`) wired + migrated; `@repo/auth` admin module; bootstrap/provision/verify ops scripts (`packages/business/scripts`); auth security config applied via Management API (signups off, test OTP, OTP 600s, pw ≥10, URLs); **11/11 live auth checks passed** (OTP, email login, activation, session restore, refresh, logout, provisioning, signup-disabled); web build + expo android bundle with real env; `docs/RUNBOOK_SUPABASE_SETUP.md` + `docs/milestones/M1.5-infrastructure.md`

- ✓ **M2 Steps 1–5** (2026-07-05) — requirements analysis; DB schema + migration
  (6 models, live-probed constraints); RLS policies (`20260705010000_academic_rls`);
  6 business services (permission+scope gated, audited in-tx); 6 thin API routers
  + Zod inputs (`istDateSchema`)
- ✓ **M2 Step 6** — mobile read-only academic screens (years/classes/subjects/
  assignments) + role-aware Home links
- ✓ **M2 Step 7** — web CRUD `/academic/*` (years+terms, classes+sections,
  subjects, assignments) with search/pagination/filters/dialogs; manage-gated UI
- ✓ **M2 Step 8** — tests: 17 files / 136 total (business 50, auth 32, api 25,
  validation 11, core 8, web 7, utils 3); typecheck+lint 14/14; web prod build
  with real env validation
- ✓ **M2 Steps 9–10** — docs synced (API_INVENTORY rewritten to implemented
  surface, feature + status docs added) + deliverables report → awaiting approval

- ✓ **M2 approved & frozen** (2026-07-05)
- ✓ **M3 Steps 1–5** (2026-07-05, commit `741dca1`) — ADR-010 (Student identity
  vs Enrollment placement) + requirements; DB schema + migration
  `20260705030000_people_management` (Student/StudentDocument/Parent/
  StudentParent/Staff/Enrollment, partial uniques, CHECKs); relationships
  (Restrict on placement history, Cascade docs/links, SetNull parent login);
  RLS `20260705040000_people_rls` (admin ALL, teacher own-section, parent
  own-child, self rows); 5 business services + shared row-scope helpers,
  audited in-tx; PERMISSIONS split `*:read`/`*:manage` per people entity
- ✓ **M3 Step 6** (`9fded51`) — 5 thin routers (`student/parent/teacherProfile/
  enrollment/studentDocument`) + Zod inputs; `StudentListFilter` widened for
  `exactOptionalPropertyTypes`
- ✓ **M3 Step 7** (`e5b7d28`) — mobile read-only people screens (students,
  student profile w/ enrollment history + guardians, parents, teacher profiles);
  permission-gated Home links
- ✓ **M3 Step 8** (`6f17532`) — web `/people/*` full CRUD (students + detail
  with enroll/transfer/promote/withdraw, guardian links, documents; parents;
  teacher profiles); **ADR-004 storage end-to-end**: business `StoragePort`
  mint services (authz before URL), API `storageProcedure` +
  `uploadUrl/downloadUrl`, web service-role adapter + `uploadToSignedUrl`;
  private `student-documents` bucket documented (runbook §3b, provisioning
  pending)
- ✓ **M3 Step 9** (`d1929eb`) — +77 tests (business 53: identity uniqueness,
  row scopes, full ADR-010 lifecycle incl. invalid transfer/promotion, guardian
  links, document visibility + mint authz; api 15; validation 9). Totals:
  **20 files / 213 tests**; typecheck+lint 14/14; web build + mobile export ✓
- ✓ **M3 Step 10** — docs synced (API_INVENTORY people section,
  `features/people-management.md`, status, milestone, memory); no new ADR
  (ADR-010 + ADR-004 cover the decisions)

- ✓ **M4 Steps 1–10 (Attendance, ADR-011)** — **Step 1** ADR-011 (Session/Record
  on Enrollment; audit actors not owner; immutable corrections; leave-as-default;
  DRAFT→SUBMITTED→LOCKED; working-day calendar) + PERMISSIONS_MATRIX. **2–4**
  migrations `20260707000000_attendance_management` (5 models/6 enums, two
  partial-unique register indexes, empirically drift-checked) + relationships
  (attendance Restrict→Enrollment) + `20260707010000_attendance_rls`. **5** 4
  services (attendance/leave/correction/holiday) — B3 staff-actor, leave biases
  roster default only, compute-on-read summary. **6** 4 thin routers + Zod. **7**
  mobile teacher mark/history/corrections + parent attendance/calendar/leave
  (added `attendance.findSession`, `attendanceCorrection.listMine`, `Record.date`).
  **8** web `/attendance/*` dashboard (bulk mark, filters, date picker, CSV,
  approval queues, holidays; added `leave.listPending` + enriched correction
  queue). **9** 392 tests incl. real Promise.all concurrency + state-machine +
  authorization matrices; **concurrency hardening (real defect):** guarded
  conditional transitions on submit/lock + correction approval. **10** docs.

- ✓ **M5 Steps 1–10 (Examination & Assessment, ADR-012)** — **Step 1** ADR-012
  (Exam→Assessment→ExamSection→Mark on Enrollment; two grains lock-per-register /
  publish-per-exam; grade snapshots; derived ownership; naming diverges from PRD)
  + 15 refinements. **2–4** migrations `20260709000000_examination_assessment` (5
  models + 2 enums, GradeBand non-overlap `EXCLUDE`, 15 constraint proofs) +
  relationships (Cascade chain + R5 published-data deletion guard, built early) +
  `20260709010000_exam_rls` (12/12 read + 15/15 write isolation proven). **5** 5
  services + central `@repo/core/grade`; race-safe register `ensure` (real race
  hardened); lock snapshots grade in-tx. **6** 4 thin routers (21 procedures) +
  Zod. **7** mobile teacher mark-entry + parent results (added `mark.markable` +
  DTO name enrichment). **8** web `/exams/*` admin console (dashboard, assessment
  CRUD, marks grid, lock/unlock, publish with R3 count, grade scales; added
  `exam.get` + `exam.registers`). **9** +60 tests → business 207 / api 266 /
  validation 50 (35/35 turbo tasks); authorization matrix + `listExamRegisters`
  mutation-checked; no defects. **10** docs.

- ✓ **M6.5 Steps 1–10 (Class Teacher Management, ADR-015)** — dedicated `ClassTeacherAssignment` (year×section → ONE teacher; in-place replace, never a 2nd row); `class-teacher.service` + `classTeacher` router (get/assign/replace/remove) + web management page + mobile read-only; the `assertClassTeacherOfEnrollment` scope predicate M7 consumes for remark authorship. Purely additive; RLS + DB invariants proven; gate 35/35.

- ✓ **M7 Steps 1–10 (Report Cards & Academic Results, ADR-014)** — **1** ADR-014 (Enrollment-owned; snapshot vs live; lifecycle; correction; R1/R2/R3 locked). **2** `ReportCard` + 4 enums (migration `20260710030000`); CHECKs + per-kind partial-uniques; 13/13 proofs, zero drift, additive. **3** leaf, 9/9 FK matrix RESTRICT + 6/6 rollback probes. **4** RLS (`20260710040000`) admin/class-teacher/parent; 10/10 isolation. **5** `services/report-card` lifecycle + `snapshot.ts` (pure rank + assembly over canonical M4/M5) + year-consistency gate; 3 permissions; persistence-only repo. **6** thin `reportCard` router (12 procedures). **7** mobile parent viewing. **8** web role-aware console `/report-cards` + `/report-cards/[id]` (+ post-review `listForSection` making the class-teacher list ClassTeacherAssignment-driven). **9** 54 tests (business 32 + api 22) + DB SQL proofs re-confirmed. **10** docs. Full gate typecheck/lint/test green; no defects.

- ✓ **M1 RLS hardening** (security-fix exception, 2026-07-05): M1 auth tables shipped with no RLS. Migration `20260705020000_m1_rls_hardening` enables RLS (not FORCE) on School/User/DeviceToken/AuditLog with read-only policies (`user_read_self` + `is_admin()` reads; owner-only device tokens; admin-only School/AuditLog) — stops parent/teacher user enumeration; no write policies (writes stay service_role); anon denied. Defense-in-depth only. **Blocking pre-apply gate:** confirm live Prisma role bypasses RLS before applying or auth locks out (see `docs/RLS_POLICIES.md`). All 80 tests still green.

## Frozen Modules (read-only — see workflow.md)

- M0 scaffold + tooling + CI
- Auth DB models (`packages/db`), Authorization (`packages/core` + `packages/business/authorization`)
- Business auth services (`packages/business/{auth,services}`), API auth router (`packages/api`)
- Mobile auth (`apps/mobile/src/{app,lib,stores,providers}`), Web auth (`apps/web` auth routes + middleware + `src/lib/supabase`)
- M2 academic structure (schema/migrations, `services/academic`, academic routers, `/academic/*` web, mobile academic screens)
- M3 people management (schema/migrations, `services/people`, people routers, `/people/*` web, mobile people screens) — frozen at M6 kickoff (implicit M5 approval)
- M4 attendance (schema/migrations, `services/attendance`, attendance/leave/correction/holiday routers, `/attendance/*` web, mobile attendance screens) — frozen at M6 kickoff
- M5 examination (schema/migrations `2026070900/0100`, `services/exam`, `@repo/core/grade`, exam/assessment/mark/gradeScale routers, `/exams/*` web, mobile exam screens) — frozen at M6 kickoff

> Frozen = amend only for a critical bug, a security fix (Step 9 may amend), or explicit user approval.

## Architecture Rules (authoritative summary — see .claude/project_rules.md)

- Business logic only in `packages/business` services; **routers stay thin** (validate → authorize → delegate).
- **Repositories contain no authorization**; only `packages/db` imports `@prisma/client`.
- **`api` never imports `db`; `apps` never import `db`/`business`** (use `@repo/api`).
- **Authorization = permission (`assertCan`) + scope (`assertScope`) in the business layer**, on the DB-built `Principal`. No role from JWT/client. No transport role gate.
- **Role/schoolId/status come only from the DB `User` profile.**
- Sensitive mutations write an `AuditLog` row in the same transaction.
- RLS is defense-in-depth (Prisma bypasses it); IST everywhere; add-ons behind `FeatureFlag`.

## Dependency Rules (package boundaries)

`core` pure (types/constants/utils only) · `db` = only Prisma consumer · `business` composes db+core+notifications · `api` → business (not db) · `apps` → api/ui/i18n (not db/business). Enforced by ESLint `no-restricted-imports`.

## Current Status

M0/M1/M1.5/M2 **approved & frozen**; M3 People + M4 Attendance + M5 Examination + M6
Homework + M6.5 Class Teacher Management complete (awaiting approval). **M7 Report Cards
& Academic Results complete (Steps 1–10), awaiting approval:** `ReportCard` Enrollment-owned,
`kind` EXAM/TERM/ANNUAL; `DRAFT→SUBMITTED→APPROVED→PUBLISHED` (+SUPERSEDED/REVOKED); snapshot
frozen at APPROVE; correction = new version (supersede-then-publish, one tx); class-teacher
remark (ADR-015). 12-procedure `reportCard` router; parent mobile + role-aware web console; 54
tests + DB proofs. See `docs/milestones/M7.md`, `docs/features/report-cards.md`, `docs/status/ReportCards.md`.

<details><summary>Prior — M6 Homework status</summary>

`Homework (Subject×Section, year-stamped) →
HomeworkAttachment / HomeworkSubmission (per Enrollment, unique) → SubmissionAttachment
(append-only) / HomeworkFeedback (immutable, text-only)` (ADR-013). Guarded
`DRAFT→PUBLISHED→CLOSED` + audited reopen; publish requires dueDate≥today (IST);
content frozen at publish (dueDate extend-only); isLate snapshot; §7 cross-table
submit invariants; §10 parent or-clause (section-match OR has-submission — survives
mid-year transfer); DRAFT-only delete (R5 analog). Derived ownership
(TeacherAssignment); parent-only submit; guarded review/resubmit races (R2); B3
actors extended to parents (R6). Private `homework-files` bucket (ADR-004) — teacher
+ parent upload/download, signed URLs, downloads never leak to another parent (R4).
2 routers / 25 procedures; RLS 28/28. Web `/homework` console (both roles, full file
upload+download, review + CSV); mobile (teacher create/review + parent submit — text
loop + download). **85 tests**; typecheck ✓ lint ✓ **35/35 turbo tasks**. Byte
upload→download round-trip is a runbook-gated manual check (no bucket in CI).
Brief **overrode the PRD** — homework is no longer distribution-only.

</details>

**M5 Examination & Assessment (Steps 1–10), awaiting approval:**
`Exam → Assessment → ExamSection (register) → Mark` on Enrollment
(ADR-012 — results survive promotion), forward-only `DRAFT→SUBMITTED→LOCKED` lock
per register + publish per exam (parents never see a partial), central grade
compute **snapshotted at lock** (GradeScale edits never mutate history),
configurable grade scales, GPA from snapshots. Ownership derives from
TeacherAssignment (admins bypass); row scope + RLS defense-in-depth (12/12 read +
15/15 write proven). Teacher mobile mark-entry + parent results; web `/exams/*`
admin console (dashboard, assessment CRUD, marks grid, lock/unlock, publish with
R3 count, grade-scale management, CSV). Race-safe register create (real race
hardened); guarded transitions. Verified **typecheck ✓, lint ✓, 35/35 turbo
tasks** (business 207, api 266, validation 50); mobile ios export ✓ (Step 7).

## Known Blockers / Notes

- **Real SMS provider pending:** Twilio creds are placeholders; only the test OTP number (`+919999900001`) works. Provider choice + India DLT needed before parent go-live.
- **Rotate credentials before real data:** service-role key + DB password (+ seed admin password) were shared during setup; HIBP protection needs the Pro plan; custom SMTP before production. See M1.5 doc "Deferred".
- **Source of truth is now Dev PRD v1.3** (merged from other contributors; reconciles milestone numbering + authz model to this code).
- **Config artifacts to resolve:** a stray root `package-lock.json` (npm) and root `tsconfig.json` were merged in — conflict with the pnpm/Turborepo setup; cleanup pending user decision.

## Next Task

**STOPPED — M11 (Announcements, Circulars & School Calendar, ADR-019) COMPLETE, all 9 steps shipped;
awaiting milestone approval to freeze.** Persistent school communication over frozen M1–M10: `+Announcement`
(DRAFT→PUBLISHED→ARCHIVED) + `+AnnouncementAttachment` (private bucket, signed-on-read) + `+SchoolCalendarEvent`
(holiday/event/exam/meeting) tables, 3 enums, 4 permissions (`announcement:read`/`manage`/`draft`, `calendar:read`;
calendar writes reuse `academic:manage`), `announcement.*` (11) + `calendar.*` (7) routers, mobile feed/detail/draft
+ calendar, web console (Draft/Published/Archive + attachment uploads) + calendar (month grid + CSV). Publish
**optionally** emits an M10 `Notification(type=ANNOUNCEMENT)` (best-effort, reuses `createBulkNotification`;
`notify:false`=silent). **Teachers draft, admins publish.** Per-user announcement targeting is a **business filter**;
RLS is **coarse** (admin ALL / authenticated published-only / anon none) — proven, plus list WHERE-clause proven
empirically. **No CUSTOM audience, no push/SMS/email/chat.** **Permission-only, NO feature flag.** Purely additive
(3 tables + 3 enums, `migrate diff` zero-ALTER, zero drift, fresh deploy). Gate green: lint/typecheck/test **35/35**
(business 403, api 339) · db:validate ✓ · mobile typecheck ✓ · web build ✓ (35/35 pages, `/announcements` +
`/calendar`). One disclosed touch of the M10 mobile inbox (`open()` prefers `actionUrl`) for announcement
deep-linking. Deferred: CUSTOM audiences, timed calendar events, M5→calendar exam sync, announcement correction.
Runbook: provision the `announcement-attachments` bucket before live uploads. Docs: `docs/features/announcements.md`
+ `calendar.md`, `docs/status/Announcements.md` + `Calendar.md`, `docs/milestones/M11.md`.

<details><summary>Prior — M10 next-task note</summary>

**STOPPED — M10 (Notifications & Communication, ADR-018) COMPLETE, all 10 steps shipped;
awaiting milestone approval to freeze.** A complete **in-app** notification system, purely additive over
frozen M1–M9: `+Notification/NotificationRecipient` tables + `NotificationType/NotificationPriority` enums,
two adopted `notification:manage_own`/`announcement:send` constants, one tRPC router (8 procedures), mobile
bell + inbox, web bell + dropdown + `/notifications` page + admin announcement composer. **No frozen-table
change** (proven by `migrate diff` — zero drift), **no new RLS policy shape**, **no new permission grant**.
Notifications are generated **after commit** by a business `*AndNotify` composition wrapping the frozen
publish services (Homework/Exam/ReportCard) — **services untouched**, routers repoint (the canonical pattern,
ADR-018 §3, moved out of transport per Step-5 review). Recipients resolved once + stored explicitly (reuse
Enrollment/TeacherAssignment); emit is best-effort. **Permission-only, NO feature flag.** **No push/SMS/
email/chat.** Gate green: lint/typecheck/test **35/35** (business 367, api 326) · db:validate ✓ · mobile
typecheck ✓ · web build ✓ (`/notifications`). RLS isolation proven live on `m9_verify` (Teacher A ≠ B,
parent ≠ other). Deferred: timetable auto-emit (reserved `TIMETABLE_UPDATED`), study-material source, push/SMS
delivery (the ADR-005 seam), notification preferences. Limitations in `docs/features/notifications.md` /
`docs/status/Notifications.md`.

</details>

<details><summary>Prior — M9 next-task note</summary>

**M9 (Timetable Management, ADR-017) COMPLETE, all 10 steps shipped.** A read-mostly domain, purely additive
over frozen M1–M8: `+BellSchedule/Period/TimetableEntry` + `Weekday` enum, two `timetable:*` constants, three
routers, mobile read screen + web admin console. Ownership from `TeacherAssignment` (never
`ClassTeacherAssignment`); double-booking structurally impossible; permission-only, no flag. Deferred:
substitute teachers, recurring templates, multiple bell schedules/year. `docs/features/timetable.md` /
`docs/status/Timetable.md`.

</details>

<details><summary>Prior — M7 next-task note</summary>

**M7 (Report Cards & Academic Results, ADR-014) COMPLETE, all 10 steps shipped.** Purely additive over
frozen M1–M6.5 (`+ReportCard` table/enums, 3 permissions, 1 additive `reportCard.listForSection` read).
Before live PDF generation, provision the private report-card bucket + build the renderer (bilingual
en+ml). Deferred: report-card notifications, CGPA-across-years, cross-year student trail.

</details>

<details><summary>Prior — M6 next-task note</summary>

**M6 (Homework & Assignment Management, ADR-013) COMPLETE, all 10 steps
shipped; awaiting milestone approval to freeze.** Before live homework uploads the
user must **provision the private `homework-files` bucket** and run the one-time
upload→download round-trip check (`RUNBOOK_SUPABASE_SETUP.md §3c`) — the only file
path CI can't exercise. Known limitations recorded in `docs/features/homework.md`
(OFFICE_ADMIN web-create picker; no un-review correction; mobile upload web-only;
no homework notifications). Prior open sign-offs still stand: **holiday = hard block
in M4** (ADR-011 §9); before live
document uploads create the private `student-documents` bucket (runbook §3b).

</details>
