# Permissions Matrix — School Management Portal

The full authorization catalog: every **permission** (`resource:action[:scope]`), which **role** holds it, and which **scope rule** narrows it. Extends Dev PRD §5 and the M1 implementation (`packages/constants/permissions.ts`, `packages/business/authorization.ts`) to all milestones. All formerly-PROPOSED rows were **adopted in Dev PRD v1.3** (see REVIEW_FINDINGS resolution status); rows noting a pending client [CONFIRM] keep that tag until answered.

**Model (ADR-002, M1 refinement):** transport authenticates (`protectedProcedure` → `Principal { userId, schoolId, role, status }` from the DB, never the JWT). The business service then checks **permission** (`assertCan(principal, PERMISSION)`) and **scope** (`assertScope(rule, principal, resourceFacts)`). There is no transport role gate.

## Scope rules (`ScopeRule` predicates)

| Rule | Grants access when… | Facts loaded by service |
|---|---|---|
| `self` | resource is the principal's own account/profile | — |
| `ownDivision` | teacher has a `TeacherAssignment` for the division | assignments |
| `ownSubject` | teacher's assignment covers the `classSubjectId` | assignments |
| `classTeacher` | principal is the section's `ClassTeacherAssignment` teacher for the year (M6.5, ADR-015 — **not** a `TeacherAssignment.isClassTeacher` flag, which was never built) | class-teacher assignment |
| `ownChild` | `GuardianStudent` links guardian → student | guardian links |
| `school` | resource's `schoolId` == principal's (always also enforced by repositories) | — |
| `any` | no narrowing (super admin) | — |

## Core permissions

SA = Super Admin, OA = Office Admin, T = Teacher, P = Parent, AC = Accountant. Cell shows the **scope rule** applied; `–` = not granted.

### Identity & users (M1)

| Permission | SA | OA | T | P | AC |
|---|---|---|---|---|---|
| `profile:read:self` / `profile:update:self` | self | self | self | self | self |
| `user:read` | any | – | – | – | – |
| `user:invite` | any | – | – | – | – |
| `user:set_role` | any | – | – | – | – |
| `user:disable` | any | – | – | – | – |
| `audit:read` | any | – | – | – | – |

### People & import (M2)

| Permission | SA | OA | T | P | AC |
|---|---|---|---|---|---|
| `student:create` / `student:update` / `student:archive` | any | school | – | – | – |
| `student:read` | any | school | ownDivision — **adopted v1.3** (Dev PRD §5 "View student records") | ownChild | – |
| `guardian:create` / `guardian:link` / `guardian:invite` | any | school | – | – | – |
| `staff:create` / `staff:update` / `staff:assign` | any | school | – | – | – |
| `import:run` | any | school | – | – | – |
| `academic:manage` (years, classes, divisions, subjects, mappings, assignments, **holidays, school settings** — v1.3) | any | school | – | – | – |
| `enrollment:enroll` / `enrollment:transfer` / `enrollment:drop` | any | school | – | – | – |
| `enrollment:promote_bulk` | any | – | – | – | – |

### Class teacher management (M6.5, ADR-015 · implemented)

| Permission | SA | OA | T | P | AC |
|---|---|---|---|---|---|
| `classTeacher.assign` / `.replace` / `.remove` → `academic:manage` | any | school | – | – | – |
| `classTeacher.get` → `academic:read` | any | school | school | – | – |

- The class teacher of a `(academicYear × section)` is the dedicated `ClassTeacherAssignment` (ADR-015) — **one row per slot**; a replacement is an **in-place update** (never a 2nd row), audited `CLASS_TEACHER_REPLACE`. `teacherId → User`; `createdByStaffId → Staff` (B3 actor — the assigning admin needs a `Staff` row).
- No new permission: management reuses `academic:manage` (its remit already covers "assignments"), reads reuse `academic:read`. RLS: admin ALL, teacher SELECT own (`teacherId = auth.uid()`), parent/anon none.
- Consumed by report cards (M7/ADR-014) via the `assertClassTeacherOfEnrollment` scope predicate — only the assigned class teacher may author teacher remarks.

### Attendance (M4 — ADR-011)

| Permission | SA | OA | T | P | AC |
|---|---|---|---|---|---|
| `attendance:mark` | any | school | ownDivision | – | – |
| `attendance:read` | any | school | ownDivision | ownChild | – |
| `attendance:correct:submit` | any | school | ownDivision | – | – |
| `attendance:correct:decide` | any | school | classTeacher | – | – |

- Session ownership is **derived from `TeacherAssignment`**, not stored on the session (ADR-011 §3). DAILY = any assignment to the section; SUBJECT = matching `(subject, section)` assignment.
- Note B3: marking + correction actors need a `Staff` row (session `createdBy/submittedBy/lockedBy`, correction `requestedBy/decidedBy` — ADR-011 §4) — provisioning must guarantee one for every SA/OA/T user.
- Holidays are managed under `academic:manage` (working-day calendar, ADR-011 §9).

### Exams & marks (M5, ADR-012 · implemented)

| Permission | SA | OA | T | P | AC |
|---|---|---|---|---|---|
| `exam:manage` (create/update/delete exams + assessments + grade scales; lock/unlock registers; publish) | any | school | – | – | – |
| `marks:enter` (save + submit a register) | any | school | ownSubject×Section (owns via `TeacherAssignment`; register lock is admin-only) | – | – |
| `marks:read` (marks/grades/GPA) | any | school | ownSection | ownChild — **published + LOCKED only** (never a partial/in-flight result) | – |

- Ownership is **derived from `TeacherAssignment(teacher, subject, section)`**, never stored (ADR-012 §9); admins bypass scope. Mark/register actors are a **`Staff` row** (B3 — via `Staff.userId`), same as attendance.
- Two grains: a register **locks** per `ExamSection` (admin), an exam **publishes** per `Exam` (admin) — publish exposes all LOCKED sections at once; grade/percentage is **snapshotted at lock** and GradeScale edits never mutate history.
- OA/SA hold `marks:enter`/`marks:read` school-wide but have no `TeacherAssignment`, so day-to-day entry is teacher-driven (mobile); admins enter/oversee via the web console (find-or-create register).
- **Not built in M5** (later milestones): `reportcard:generate`/`reportcard:read` (report-card PDFs, ADR-009), publish-notify (no notifications in M5), CGPA-across-years.

### Homework & Assignment Management (M6, ADR-013 — implemented)

Built as **M6** (see `docs/milestones/M6.md`). The M6 brief **overrode the PRD's
distribution-only plan** (decision-#13): parent submissions, uploads, teacher review,
and feedback are **core** (no `homework-uploads` flag). Homework is **always
subject-bound**, so teacher scope is uniformly `ownSubject×Section` (derived from
`TeacherAssignment`) — there is no division-only variant. Deviations from the
PRD-planned rows are decided in ADR-013 §11 (OA gets `homework:manage`; `submission:
submit` is parent-only). Row/ownership scope is enforced in the service; RLS is
defense-in-depth (28/28 isolation proven).

| Permission | SA | OA | T | P | AC |
|---|---|---|---|---|---|
| `homework:manage` (create/edit/publish/close/reopen/delete + teacher attachments) | any | school | ownSubject×Section | – | – |
| `homework:read` | any | school | ownSubject×Section | ownChild (PUBLISHED/CLOSED, §10 or-clause) | – |
| `submission:submit` (create/resubmit + parent attachments) | – | – | – | ownChild | – |
| `submission:review` (return/accept + feedback) | any | school | ownSubject×Section | – | – |
| `submission:read` | any | school | ownSubject×Section | ownChild (own submissions/feedback) | – |

Notes:
- **`submission:submit` is parent-only** — admins do not fabricate a child's submission (no Student login; the Parent is the actor).
- **Download scope** (signed URLs): submission files reach admins, the owning teacher, and the linked parents — **never another parent** (R4).
- **Not built in M6** (later milestones): homework notifications (publish/feedback send none), un-review correction, standalone "notes".

### Report Cards & Academic Results (M7, ADR-014 — implemented)

Built as **M7** (see `docs/milestones/M7.md`). Lifecycle authority is **admin**
(`report_card:manage` — generate/edit/approve/publish/reopen/revoke/correct); the **class
teacher** authors a remark + submits under `report_card:remark`, narrowed by the `classTeacher`
scope (`assertClassTeacherOfEnrollment`, ADR-015) — a subject teacher of the same section is
refused; parents read own-child **PUBLISHED** cards. Row/ownership scope is enforced in the
service; RLS is defense-in-depth (10/10 read+write isolation proven).

| Permission | SA | OA | T | P | AC |
|---|---|---|---|---|---|
| `report_card:manage` (generate/edit/approve/publish/reopen/revoke/correct) | any | school | – | – | – |
| `report_card:remark` (draft class-teacher remark + submit) | – | – | `classTeacher` (own section) | – | – |
| `report_card:read` | any | school | `classTeacher` (own section) | ownChild (PUBLISHED only) | – |

Notes:
- **`report_card:remark` is the class-teacher capability** — every TEACHER holds it, but the
  `assertClassTeacherOfEnrollment` scope refuses anyone who is not the section's class teacher.
- **Approve requires SUBMITTED** — approving a DRAFT (skip-state) is rejected, so every card
  passes the class-teacher review gate before approval.
- **Snapshot is frozen at APPROVE**; PUBLISHED cards are immutable — a fix is a **new version**
  (correct → publish, which supersedes the prior published one). Every publish/correction is audited.
- **Not built in M7** (later milestones): PDF rendering, report-card notifications, CGPA-across-years.

### Leave, communication (PRD-planned — NOT built)

> Numbering note: this project built **M5 = Examination**, **M6 = Homework** (above);
> the PRD's leave/communication plan shifts out. Tags left as-is pending an explicit
> renumbering decision.

| Permission | SA | OA | T | P | AC |
|---|---|---|---|---|---|
| `leave:apply` | – | – | – | ownChild | – |
| `leave:decide` | any | – | classTeacher | – | – |
| `leave:read` | any | school | classTeacher | ownChild (own applications) | – |
| `announcement:create:school` | any | school | – | – | – |
| `announcement:create:division` | any | school | classTeacher — **adopted v1.3** (Dev PRD §5/§8.8; client [CONFIRM §16.14] pending) | – | – |
| `announcement:read` | any | school | school | school (scoped to child's class/division + school-wide) | school |
| `message:create_thread` | any | – | own students' guardians | – (reply only) | – |
| `message:send` | any | – | own threads | own threads | – |
| `notification:manage_own` (list, unreadCount, markRead, markAllRead, archive, unarchive, delete — **M10, ADR-018**) | self | self | self | self | self |
| `announcement:send` (compose+send an ANNOUNCEMENT — **M10**, supersedes the planned `announcement:create:*` split above) | any | school | – | – | – |

### Notifications & Communication (M10, ADR-018 — implemented)

Built as **M10** (see `docs/milestones/M10.md`). **Permission-only — no feature flag.** In-app only (no
push/SMS/email). `notification:manage_own` is **self-scope** for every role (a user acts only on their own
recipient rows — enforced in the service; RLS is defense-in-depth, isolation proven: Teacher A ≠ Teacher B,
parent ≠ other parent). `announcement:send` is SA/OA only.

Notes:
- Notifications are generated **after** a publish commits by a business `*AndNotify` composition (the frozen
  publish services are untouched); announcement is the one manual admin action. Recipients are resolved once
  (reuse Enrollment/TeacherAssignment) and stored explicitly.
- The planned `announcement:create:school`/`:division` + `announcement:read` rows are **superseded** by M10 —
  announcements ship as `Notification(type=ANNOUNCEMENT)` sent under `announcement:send`; reading is the normal
  inbox (`notification:manage_own`). No separate `Announcement` table.
- **Not built in M10** (deferred): push/SMS/WhatsApp delivery, notification preferences, timetable/study-material
  notification sources.

### Announcements, Circulars & Calendar (M11, ADR-019 — implemented)

Built as **M11** (see `docs/milestones/M11.md`). **Permission-only — no feature flag.** Persistent communication
over frozen M1–M10; a published announcement optionally emits an M10 notification. The `manage`/`draft`/`read`
split mirrors the M7 report-card `manage`/`remark`/`read` shape. Calendar **writes reuse `academic:manage`**
(the holiday/M6.5 precedent — no new write permission). Per-user announcement targeting is a **business-layer**
filter; RLS is coarse defense-in-depth (admin ALL / authenticated published-only / anon none).

| Permission | SA | OA | T | P | AC |
|---|---|---|---|---|---|
| `announcement:manage` (create/update/**publish**/archive/delete + attachments, any scope) | any | school | – | – | – |
| `announcement:draft` (create/update/delete **DRAFT** + attachments; own SECTION/CLASS; **no publish/archive**) | – | – | ownSection | – | – |
| `announcement:read` (targeted feed) | any | school | targeted (own drafts + published for own section-class + groups) | ownChild (published for child's section-class + WHOLE_SCHOOL/PARENTS) | – |
| `calendar:read` (school calendar) | any | school | school | school | – |
| calendar writes → `academic:manage` | any | school | – | – | – |

Notes:
- **Teachers draft, admins publish** (Step-1 approval) — a teacher's `announcement:draft` stops short of the
  publish/archive lifecycle; an admin publishes it. Teacher draft scope is narrowed to sections/classes they teach.
- **`announcement:read` is targeted in the service** — the `get`/attachment paths 404 an out-of-scope reader (no
  existence leak; the R4 attachment guard); the feed pushes the targeting predicate into the repo WHERE.
- **`calendar:read` is required** — parents hold no `academic:read`, and `holiday:read` is holiday-only; the school
  calendar (events/exams/meetings) needs its own cross-role read. **Accountants** hold neither M11 read (out of scope).
- M10's `announcement:send` stays separate/frozen (the ephemeral quick-blast); M11's `Announcement` is the
  persistent system of record. The old planned `announcement:read`/`:create:*` rows are now realised by M11.
- **Not built in M11** (deferred): CUSTOM (hand-picked) audiences, timed (non-all-day) calendar events, M5→calendar
  exam sync, published-announcement correction/versioning.

### Student Discipline & Leave (M12, ADR-020 — implemented)

Built as **M12** (see `docs/milestones/M12.md`). **Permission-only — no feature flag.** Behaviour incidents over
frozen M1–M11; the `manage`/`record`/`read` split mirrors the M7 report-card `manage`/`remark`/`read` shape. **Leave
reuses the existing `leave:apply/decide/read` (M4) verbatim — no new leave permission**; M12 only adds a parent
notification when a decision is made (the `leave.decide` router repoints to `decideLeaveAndNotify`). Behaviour read is
business-scoped; RLS is coarse defense-in-depth (admin ALL / teacher own-incidents / parent own-child / anon none).

| Permission | SA | OA | T | P | AC |
|---|---|---|---|---|---|
| `behaviour:manage` (create/update/resolve/close/read any student + the console) | any | school | – | – | – |
| `behaviour:record` (create/update/resolve/close **own** incidents for **own-section** students; `teacherId`=self) | – | – | ownSection | – | – |
| `behaviour:read` (incident history) | any | school | own + ownSection | ownChild | – |
| `leave:apply` / `leave:decide` / `leave:read` *(frozen M4 — unchanged)* | see Attendance (M4) | | | | |

- **Teachers record, admins oversee** — `behaviour:record` is the teacher capability (server-set `teacherId=self`,
  own-section student scope, the `report_card:remark` shape); `behaviour:manage` is the admin console + any-student
  lifecycle. Both can resolve/close their own; CLOSED is terminal.
- **`behaviour:read` is business-scoped** — admin all; teacher own referrals + a student's full history when the
  student is in an own section (broader than the own-incident RLS, intentionally — business is the gate); parent own
  child. The console list is admin-only (`behaviour:manage`).
- **Accountants:** none (out of scope). **No feature flag.**

### Fees & Payments (M13, ADR-021 — implemented)

Built as **M13** (see `docs/milestones/M13.md`). **Permission-only — no feature flag.** Fee structures, invoices and
payments over frozen M1–M12; the `manage`/`read` + `record`/`read` split mirrors the M7/M12 shape. Money mutations
(structures, invoices) are admin-only; **payment recording is a separate grant** so the front-office collection surface
is auditable independently. Read is business-scoped; RLS is coarse defense-in-depth (admin ALL / parent own-child /
anon none; teacher read is business-only).

| Permission | SA | OA | T | P | AC |
|---|---|---|---|---|---|
| `fee:manage` (structures + invoice generate/issue/cancel + read all) | any | school | – | – | – |
| `fee:read` (invoices / dues) | any | school | ownSection (read-only) | ownChild | – |
| `payment:record` (record a payment against an invoice) | any | school | – | – | – |
| `payment:read` (payments / receipts) | any | school | – | ownChild | – |

- **Admins manage, the office collects** — `fee:manage` covers structures + the invoice lifecycle; `payment:record` is
  the collection capability (cash/UPI/cheque at the office; **parents cannot pay online in v1** — no gateway).
- **`fee:read` / `payment:read` are business-scoped** — admin all; teacher reads own-section invoices only (no payment
  access); parent reads own child's invoices, dues and receipts (the fee portal). The admin console + payment log are
  `fee:manage` / admin-only.
- **Accountants:** none (out of scope — no payroll/accounting). **No feature flag.** Refunds + concessions deferred.

### Analytics & Reporting (M14, ADR-022 — implemented)

Built as **M14** (see `docs/milestones/M14.md`). **No new permission.** Analytics is read-only aggregation of data the
principal can already read, so each panel authorizes by **reusing the underlying domain read + its scope** —
`attendance:read` / `marks:read` / `fee:read` / `report_card:read` / `behaviour:read` / `student:read` (admin school /
teacher own-section / parent own-child). School-wide panels (`schoolSummary`, `feeCollection`, `topPerformers`,
`atRiskStudents`) add an **admin-only guard** (SUPER_ADMIN / OFFICE_ADMIN). The composite `analytics.dashboard`
self-authorizes per panel. **No feature flag.**

- The flag-gated, SA-only **`analytics:view`** add-on row (below) is **superseded** — it predates teacher/parent
  dashboards and needs feature-flag infra that does not exist (the M9/M10 supersession precedent). M14 ships analytics
  permission-only via domain-read reuse.
- Over-exposure is structurally impossible: the raw-read gate is the aggregate gate. Verified by the analytics transport
  permission-matrix tests (teacher/parent denied the admin panels; unauthenticated → UNAUTHORIZED).

### Documents, Certificates & Downloads (M15, ADR-023 — implemented)

Built as **M15** (see `docs/milestones/M15.md`). **Permission-only — no feature flag.** A per-student document center
(issued certificates + uploaded files) over frozen M1–M14; the `manage`/`approve`/`read` split. Two new tables
(`Document`/`DocumentTemplate`), new private bucket `documents` (60s signed URLs). **Distinct from the M3 `StudentDocument`
KYC store** (which keeps its type-visibility rule below). Row scope + the APPROVED-only status filter are enforced in the
service; RLS is defense-in-depth (admin ALL / teacher own-section read / parent own-child read / anon none — 11/11 proven).

| Permission | SA | OA | T | P | AC |
|---|---|---|---|---|---|
| `document:manage` (generate + upload + delete-draft + archive + template CRUD) | any | school | – | – | – |
| `document:approve` (draft → APPROVED, the visibility gate) | any | school | – | – | – |
| `document:read` (list + download) | any | school | ownSection (**APPROVED only**) | ownChild (**APPROVED only**) | – |

- **Office/admin generate + upload + approve; teachers view-only; parents download own child.** `document:manage`/
  `approve` are SA/OA only. Teacher/parent reads are narrowed to **APPROVED** documents in the service (drafts/archived are
  staff-only — the report-card PUBLISHED-only precedent); teacher scope is own-section (`teaches_student`, the M3 precedent).
- **Generation is metadata-first (v1)** — a GENERATED doc freezes `snapshotJson` at issue time (ADR-014 snapshot
  philosophy) and has no rendered file until rendering lands; the upload path is fully working. No PDF renderer.
- **Accountants:** none (out of scope). **No feature flag.**

### Timetable Management (M9, ADR-017 — implemented)

Built as **M9** (see `docs/milestones/M9.md`). **Permission-only — the `timetable` flag is NOT used**
(ADR-017 §4: no `FeatureFlag` infrastructure exists; a flag table would break M9's "only additive
timetable tables" proof — the ADR-013/M6 precedent of shipping a matrix-flagged feature as core). Ownership
derives from `TeacherAssignment(teacher, subject, section)` — **never** `ClassTeacherAssignment`. Row scope
enforced in the service; RLS is defense-in-depth (isolation proven: Teacher A ≠ Teacher B, parent ≠ other section).

| Permission | SA | OA | T | P | AC |
|---|---|---|---|---|---|
| `timetable:manage` (bell schedule / periods / entries) | any | school | – | – | – |
| `timetable:read` | any | school | **own slots** (`teacherId = self`) | ownChild's section | – |

Notes:
- **Teacher read = own slots only** (narrows the PRD's `ownDivision`) — the isolation proof "Teacher A cannot
  read Teacher B" forces `teacherId = auth.uid()` at the row level; a teacher does **not** see the full section
  grid in M9. A **parent** sees the child's whole section grid (all teachers) — the deliberate asymmetry.
- **Reads default to the ACTIVE year** server-side (a parent has no `academic:read` to supply a year).
- **Not built in M9** (deferred): notifications, substitute teachers, recurring/template timetables.

### Add-ons (feature-flag gated first, then permission)

| Permission | Flag | SA | OA | T | P | AC |
|---|---|---|---|---|---|---|
| `fees:manage` (structures, invoices, reminders) | `fees` | any | – | – | – | school |
| `fees:view` | `fees` | any | school | – | ownChild (own invoices) | school |
| `fees:pay` | `fees` | – | – | – | ownChild | – |
| ~~`timetable:manage` / `timetable:read` (`timetable` flag)~~ | — | — | — | — | — | **implemented in M9 permission-only** — see the Timetable section above |
| ~~`analytics:view` (`analytics` flag)~~ | — | — | — | — | — | **superseded in M14 permission-only** — see the Analytics section above (reuses domain reads; no flag) |
| `flags:manage` | — | any | – | – | – | – |

## Student document visibility (M3)

RLS decides **who** can reach a student's documents (admin all; teacher = own-section students; parent = own children). The **business layer** (`StudentDocumentService`) then filters **which document types** are returned, by role — RLS is unchanged:

| `StudentDocumentType` | SUPER_ADMIN / OFFICE_ADMIN | TEACHER | PARENT (own child) |
|---|---|---|---|
| `PHOTO` | ✓ | ✓ | ✓ |
| `AADHAAR`, `PASSPORT`, `BIRTH_CERTIFICATE`, `TRANSFER_CERTIFICATE`, `MEDICAL_RECORD`, `OTHER` | ✓ | **hidden** | ✓ |

- Teachers see **only `PHOTO`**; every other type is hidden from teacher-facing APIs (list + get + signed-URL mint).
- **Never expose `MEDICAL_RECORD` to teachers.** If teachers ever need medical info, add a dedicated **Medical Summary** feature — not access to the uploaded files.
- Parents see all types for their **own** children only (RLS already limits reach).

## Enforcement invariants

1. Every add-on procedure checks `FeatureFlag` **before** permission; off → `FORBIDDEN` (ADR-006).
2. Repositories always scope by `schoolId` regardless of role (ADR-003/008) — `school` scope is belt-and-braces.
3. `status === ACTIVE` is enforced per request when the `Principal` is built (disabled users are revoked immediately).
4. Sensitive mutations (marks, attendance, users/roles, enrollment/promotion, money, leave decisions) write `AuditLog` in the same transaction (ADR-007).
5. Storage access is never direct: a tRPC procedure authorizes with this matrix, then mints a short-lived signed URL (ADR-004).
6. Every permission lands in `packages/constants/permissions.ts` in its milestone — this doc and that file must stay in lockstep (review checklist item).
