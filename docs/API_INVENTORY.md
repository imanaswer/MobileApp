# API Inventory — School Management Portal

Complete catalog of the tRPC surface (expands Dev PRD §7), plus scheduled jobs, webhooks, HTTP routes, and the notification event matrix. Conventions per `API_CONVENTIONS.md`. Q = query, M = mutation. **Audit** = writes `AuditLog` in-transaction. **Notif** = fires `NotificationService`. Permissions reference `PERMISSIONS_MATRIX.md`.

## system (M0/M1 — implemented)

| Procedure | T | Auth | Notes |
|---|---|---|---|
| `system.live` | Q | public | liveness; no deps |
| `system.ready` | Q | public | readiness; DB via api→business→db |

## auth (M1 — implemented)

Gates: **onboarding** = authenticated, INVITED or ACTIVE (DISABLED rejected); **protected** = authenticated + ACTIVE only. Fine-grained permission is then enforced in the business service (`assertCan`).

| Procedure | T | Gate | Permission | Audit | Notes |
|---|---|---|---|---|---|
| `auth.me` | Q | onboarding | – | – | returns the `Principal` (userId/schoolId/role/status) |
| `auth.registerProfile` | M | onboarding | – | ✓ `USER_ACTIVATED` | idempotent first-sign-in activation INVITED→ACTIVE; re-sign-in only touches `lastLoginAt` (not re-audited) |
| `auth.updateProfile` | M | protected | `profile:update:self` | – | own non-credential fields (M1: locale) |
| `auth.setRole` | M | protected | `user:set_role` | ✓ | |
| `auth.disableUser` | M | protected | `user:disable` | ✓ | self-disable rejected (FORBIDDEN) |
| `auth.enableUser` | M | protected | `user:disable` | ✓ | re-enable → ACTIVE |

Logout/refresh are client-side Supabase session operations (`@repo/auth` helpers), not procedures.

## academic structure (M2 — implemented)

Six flat routers (naming per M2 kickoff brief: **Class/Section**, not the older
ClassLevel/Division draft). All procedures run on the **protected** gate
(authenticated + ACTIVE); the business service then enforces the permission.
Reads need `academic:read` (SUPER_ADMIN, OFFICE_ADMIN, TEACHER); mutations need
`academic:manage` (SUPER_ADMIN, OFFICE_ADMIN). Parents have no access. Every
mutation writes `AuditLog` in the same transaction. Lists return bounded full
arrays (single-tenant admin data) — cursor pagination arrives with unbounded data.

| Procedure | T | Permission | Audit | Notes |
|---|---|---|---|---|
| `academicYear.list/get` | Q | `academic:read` | – | |
| `academicYear.create/update` | M | `academic:manage` | ✓ | name unique/school; start<end; ≤1 ACTIVE/school |
| `academicYear.delete` | M | `academic:manage` | ✓ | cascades its terms (DB Cascade) |
| `academicTerm.list` | Q | `academic:read` | – | by `academicYearId` |
| `academicTerm.get` | Q | `academic:read` | – | |
| `academicTerm.create/update` | M | `academic:manage` | ✓ | name unique/year; start<end; no overlap (incl. boundary) |
| `academicTerm.delete` | M | `academic:manage` | ✓ | |
| `class.list/get` | Q | `academic:read` | – | ordered by `sortOrder` |
| `class.create/update` | M | `academic:manage` | ✓ | name unique/school |
| `class.delete` | M | `academic:manage` | ✓ | blocked while sections exist |
| `section.list` | Q | `academic:read` | – | by `classId` |
| `section.get` | Q | `academic:read` | – | |
| `section.create/update` | M | `academic:manage` | ✓ | name unique/class |
| `section.delete` | M | `academic:manage` | ✓ | blocked while assignments exist |
| `subject.list/get` | Q | `academic:read` | – | school-wide catalog |
| `subject.create/update` | M | `academic:manage` | ✓ | name unique/school |
| `subject.delete` | M | `academic:manage` | ✓ | blocked while assignments exist |
| `teacherAssignment.list` | Q | `academic:read` | – | filters teacher/subject/section; a TEACHER is always scoped to own rows |
| `teacherAssignment.get` | Q | `academic:read` | – | teacher may read only own (scope rule) |
| `teacherAssignment.create` | M | `academic:manage` | ✓ | assignee must be ACTIVE TEACHER in school; no duplicate (teacher, subject, section) |
| `teacherAssignment.delete` | M | `academic:manage` | ✓ | assignments are immutable — no update |

## class teacher management (M6.5 — implemented, ADR-015)

The `classTeacher` router — the current class teacher of a `(academicYear × section)`
slot (one row; a replacement is an **in-place update**, never a 2nd row). Thin
transport → business (assertCan + audit-in-tx); no Prisma in the router. Reads
reuse `academic:read`, mutations `academic:manage` (no new permission).

| Procedure | Type | Permission | Audit | Notes |
|---|---|---|---|---|
| `classTeacher.get` | Q | `academic:read` | – | current class teacher of `(academicYearId, sectionId)` or null; **`teacherName` (M8)** |
| `classTeacher.assign` | M | `academic:manage` | ✓ | empty slot only; assignee ACTIVE TEACHER in school; `assignedAt=now`, `createdByStaffId`=acting staff; unique `(year, section)` → `CONFLICT` if taken |
| `classTeacher.replace` | M | `academic:manage` | ✓ | occupied slot → in-place update (`teacherId`, `assignedAt=now`); ONE `CLASS_TEACHER_REPLACE` audit (before/after); `NOT_FOUND` if empty |
| `classTeacher.remove` | M | `academic:manage` | ✓ | frees the slot (by id); history stays in `AuditLog` |

## people management (M3 — implemented)

Five flat routers on the **protected** gate. The service enforces the permission
AND row scope: a TEACHER reads only students enrolled in sections they teach
(ACTIVE year, via TeacherAssignment) and only their own staff profile; a PARENT
reads only their own children (via StudentParent) and their own parent record.
**Student is identity only — Enrollment owns per-year placement (ADR-010).**
Every mutation writes `AuditLog` in the same transaction. Bounded full lists
(single school) — cursor pagination arrives with genuinely unbounded data.

| Procedure | T | Permission | Audit | Notes |
|---|---|---|---|---|
| `student.list` | Q | `student:read` | – | server-side status filter + search; row-scoped |
| `student.get` | Q | `student:read` | – | row-scoped |
| `student.create` | M | `student:manage` | ✓ | admissionNo unique/school; Aadhaar unique when present |
| `student.update` | M | `student:manage` | ✓ | identity fields only — never class/section/year |
| `student.archive` | M | `student:manage` | ✓ | lifecycle, not delete |
| `parent.list` / `get` | Q | `parent:read` | – | PARENT role → own record only |
| `parent.create` / `update` | M | `parent:manage` | ✓ | optional 1:1 `User` link (portal login vs contact-only) |
| `parent.delete` | M | `parent:manage` | ✓ | removes the record; links cascade |
| `parent.link` / `unlink` | M | `parent:manage` | ✓ | `(student, parent, relationship)` unique; `isPrimary` clears the previous primary |
| `parent.guardians` | Q | `student:read` | – | one student's links; student-scoped |
| `teacherProfile.list` / `get` | Q | `staff:read` | – | TEACHER → own profile only; `StaffDto.name` (M8) |
| `teacherProfile.create/update/delete` | M | `staff:manage` | ✓ | **`name` required (M8)**; employeeId unique/school; 1:1 User (no auth duplication) |
| `enrollment.listByStudent` | Q | `enrollment:read` | – | full history (never mutated); student-scoped; **enriched (M8): `academicYearName`/`className`/`sectionName`** (server-side join — parent-safe, no `academic:read`) |
| `enrollment.sectionRoster` | Q | `enrollment:read` | – | teacher → only sections they teach; parent → none; **enriched (M8): `studentName`** |
| `enrollment.create` | M | `enrollment:manage` | ✓ | one per (student, year); no section → ADMITTED; rollNo needs a free slot in section+year |
| `enrollment.transfer` | M | `enrollment:manage` | ✓ | same class, IN-PLACE on the same row (ADR-010 §5); rollNo cleared unless re-given |
| `enrollment.promote` | M | `enrollment:manage` | ✓ | NEW row in the target year; source → PROMOTED (or RETAINED if same class) |
| `enrollment.withdraw` | M | `enrollment:manage` | ✓✓ | enrollment → DROPPED **and** student → WITHDRAWN, one tx, two audit rows |
| `studentDocument.list` / `get` | Q | `student_document:read` | – | TEACHER sees the PHOTO type only |
| `studentDocument.upload` / `replace` | M | `student_document:manage` | ✓ | metadata only (bytes in Storage); replace bumps `version` |
| `studentDocument.delete` | M | `student_document:manage` | ✓ | metadata only; the stored file stays until storage cleanup |
| `studentDocument.uploadUrl` | M | `student_document:manage` | – | **storage gate**; one-time signed upload URL, server-chosen `schoolId/…` path (ADR-004) |
| `studentDocument.downloadUrl` | M | `student_document:read` | – | **storage gate**; 300 s signed URL, minted only after scope + type-visibility checks |

Storage gate = `storageProcedure`: the host must wire a `StoragePort`
(service-role signed-URL adapter) into the tRPC context; without it these two
return `PRECONDITION_FAILED`. Web wires it in `apps/web/src/lib/storage.ts`.

Still planned from the old draft: `students.bulkImport` (ImportJob), guardian
portal invites, and the class-teacher flag on assignments — future milestones.

## calendar / settings (M4+ — planned)

Older draft rows (pre-M2-kickoff naming). `setCurrent` was subsumed by
`academicYear.update { status }`; single-enrollment ops shipped in M3 above
(`promoteBulk` with dry-run remains future work); holidays, settings, and
class-subject mapping are future work.

| Procedure | T | Permission | Audit | Notes |
|---|---|---|---|---|
| ~~`academic.holidays.*`~~ | Q/M | `academic:manage` | ✓ | **shipped in M4 as `holiday.*`** (attendance section); working-day calendar, ADR-011 §9 |
| `academic.settings.get/update` | Q/M | `academic:manage` | ✓ | typed `SchoolSettings` (attendance mode, periods, cutoff, working weekdays) |
| `classSubjects.*` (class↔subject mapping) | Q/M | `academic:manage` | ✓ | with class-teacher flag on assignments |
| `enrollment.promoteBulk` | M | `enrollment:manage` | ✓ | retain/transfer overrides; dry-run mode recommended |

## attendance (M4 — implemented, ADR-011)

Four flat routers on the **protected** gate. Attendance keys to **Enrollment,
never Student** (history survives promotion). A register is an `AttendanceSession`
(the event) holding many `AttendanceRecord`s; ownership **derives from
TeacherAssignment** (not stored). Lifecycle is forward-only `DRAFT → SUBMITTED →
LOCKED`; after LOCK a record changes only via an approved correction. Every
mutation writes `AuditLog` in the same transaction. Concurrency-safe: session
create (DB partial-unique), record mark (idempotent upsert), and state
transitions + correction approval (guarded conditional updates → `Conflict` on a
lost race). Dates transform to `@db.Date` at the Zod boundary (`istDateSchema`).

| Procedure | T | Permission | Audit | Notes |
|---|---|---|---|---|
| `attendance.openSession` | M | `attendance:mark` | ✓ | opens a DRAFT register; rejected on a holiday or a duplicate `(section,date,type,subject)`; teacher → own section |
| `attendance.findSession` | Q | `attendance:read` | – | resolve the register (or null) **without** creating one — the marking screen's open-vs-resume decision |
| `attendance.roster` | Q | `attendance:read` | – | ACTIVE enrollments + existing marks + **leave-derived suggested default** (no eager write); teacher own-section |
| `attendance.mark` | M | `attendance:mark` | ✓ (bulk, one row) | idempotent upsert per `(session, enrollment)`; **DRAFT only**; each enrollment must be ACTIVE + in the section; bad row rolls the batch back |
| `attendance.submit` | M | `attendance:mark` | ✓ | DRAFT → SUBMITTED (guarded); stamps `submittedBy/At` |
| `attendance.lock` | M | `attendance:mark` | ✓ | SUBMITTED → LOCKED (guarded); stamps `lockedBy/At` |
| `attendance.records` | Q | `attendance:read` | – | a session's marks; teacher own-section |
| `attendance.history` | Q | `attendance:read` | – | one enrollment's records over a range; parent own-child, teacher own-section |
| `attendance.summary` | Q | `attendance:read` | – | **compute-on-read** % (no table/cron); PRESENT/LATE=1, HALF_DAY=0.5, LEAVE excluded (ADR-011 §10) |
| `leave.create` | M | `leave:apply` | ✓ | parent applies for own child; PENDING; writes no attendance |
| `leave.decide` | M | `leave:decide` | ✓ | approve/reject; **writes no attendance record** (§7) |
| `leave.cancel` | M | `leave:apply` | ✓ | parent cancels own PENDING request |
| `leave.listByEnrollment` | Q | `leave:read` | – | parent own-child, teacher own-section |
| `leave.listPending` | Q | `leave:decide` | – | school-wide approval queue, enriched with student name |
| `attendanceCorrection.submit` | M | `attendance:correct:submit` | ✓ | immutable request snapshotting `previousStatus`; teacher own-section |
| `attendanceCorrection.decide` | M | `attendance:correct:decide` | ✓ | approve applies `requestedStatus` (optimistic-guarded, guarded-once); reject leaves the record untouched |
| `attendanceCorrection.listPending` | Q | `attendance:correct:decide` | – | approval queue, enriched with student name + record date |
| `attendanceCorrection.listMine` | Q | `attendance:correct:submit` | – | the actor's own submitted corrections + status (mobile) |
| `holiday.list` | Q | `holiday:read` | – | year calendar; readable by all in-scope roles |
| `holiday.create` | M | `academic:manage` | ✓ | one per `(year, date)`; curates the working-day calendar |
| `holiday.delete` | M | `academic:manage` | ✓ | – |

Superseded from the v1.2 draft: the single `attendance.markBulk` on
`[enrollmentId, date, period]` — the Session/Record split replaces it (ADR-011).
Absence-push and scheduled %-rollup jobs remain future (notification/analytics
milestones); **subject/period attendance** is schema-ready (`sessionType=SUBJECT`)
but daily-first in the UI.

## exams — Examination & Assessment (M5, ADR-012 · implemented)

Four flat routers (`exam/assessment/mark/gradeScale`) on the **protected** gate.
Marks key to **Enrollment, never Student** (ADR-010; results survive promotion).
Hierarchy `Exam → Assessment (Exam×Subject) → ExamSection (the register, per
section) → Mark (per enrollment)`. **Two grains:** a register **LOCKs** per
ExamSection (`DRAFT → SUBMITTED → LOCKED`, forward-only, guarded); an exam
**PUBLISHes** per Exam (exposes every LOCKED section at once — parents never see a
partial exam). Grade/percentage is computed centrally (`@repo/core/grade`) and
**snapshotted onto Mark at lock**; GradeScale edits never mutate a locked result;
GPA reads snapshots only. Ownership **derives from TeacherAssignment** (teacher →
own subject×section; admins bypass). Every mutation writes `AuditLog` in the same
transaction. Register create is race-safe (`ensure` upsert); transitions are
guarded (→ `Conflict` on a lost race). Publish sends **no notification** (M5
excludes notifications — brief overrides Dev PRD §7).

| Procedure | T | Permission | Audit | Notes |
|---|---|---|---|---|
| `exam.create` | M | `exam:manage` | ✓ | admin; validates year + optional grade scale in-school |
| `exam.update` | M | `exam:manage` | ✓ | blocked once published (definition frozen) |
| `exam.publish` | M | `exam:manage` | ✓ | exposes all LOCKED sections; guarded (double-publish → `Conflict`); **no notification** |
| `exam.get` | Q | `exam:manage` | – | one exam (admin detail page) |
| `exam.list` | Q | `exam:manage` | – | a year's exams (admin dashboard) |
| `exam.registers` | Q | `exam:manage` | – | every register under an exam, name-enriched — oversight + the publish locked-vs-total count (R3); admins have no `TeacherAssignment` so `mark.markable` is empty for them |
| `exam.delete` | M | `exam:manage` | ✓ | rejected if the exam is published or any child section is LOCKED (R5 guard) |
| `assessment.create` | M | `exam:manage` | ✓ | Exam×Subject; `maxTheory` + nullable `maxPractical` + `passMark`; blocked on a published exam |
| `assessment.list` | Q | `exam:manage` | – | an exam's assessments |
| `assessment.delete` | M | `exam:manage` | ✓ | same published/locked guard |
| `mark.markable` | Q | `marks:enter` | – | teacher's active-year (assessment×section) targets + register status/id (mobile discovery) |
| `mark.save` | M | `marks:enter` | ✓ | teacher own subject×section; **DRAFT only**; auto-creates the register on first save (race-safe); validates R4 (obtained ≤ max), theory-only, absent-no-marks, cross-year |
| `mark.submit` | M | `marks:enter` | ✓ | DRAFT → SUBMITTED (guarded) |
| `mark.lock` | M | `exam:manage` | ✓ | admin; SUBMITTED → LOCKED; computes + **snapshots** grade in one tx; rejects an incomplete register or a non-absent %→no-band gap |
| `mark.unlock` | M | `exam:manage` | ✓ | admin; LOCKED → DRAFT; **requires a reason** (audited); post-publish fix = unlock→edit→lock→publish |
| `mark.listByRegister` | Q | `marks:read` | – | the marking grid — a register's marks; admin or owning teacher |
| `mark.listByEnrollment` | Q | `marks:read` | – | one enrollment's marks; **parent → published+LOCKED own-child only**; subject/exam name-enriched |
| `mark.gpa` | Q | `marks:read` | – | enrollment GPA from snapshots only; parent published-only; null when the scale has no points |
| `mark.deleteRegister` | M | `exam:manage` | ✓ | same published/locked guard |
| `gradeScale.create` | M | `exam:manage` | ✓ | percent bands + nullable `gradePoint`; non-overlap (DB `EXCLUDE` + friendly precheck) |
| `gradeScale.list` | Q | `exam:manage` | – | the school's grade scales |

**Not built in M5** (design-compatible, later milestones): publish-*notify* (no
notifications in M5), CGPA-across-years (foundation only — GPA is active-year;
snapshots enable the aggregate), exam attempts/re-exams. Report cards shipped in
**M7** (ADR-014) — see the `reportCard` section below.

## homework / submission — Homework & Assignment Management (M6, ADR-013 · implemented)

Two flat routers on the **protected** gate; signed-URL mints add the
`storageProcedure` (host-injected `StoragePort`, ADR-004). `Homework (Subject×Section,
year-stamped) → HomeworkAttachment / HomeworkSubmission (per Enrollment, unique) →
SubmissionAttachment (append-only) / HomeworkFeedback (immutable)`. Guarded
`DRAFT→PUBLISHED→CLOSED` + audited `reopen`; §7 submit invariants + §10 parent
or-clause enforced in the service; audit in-tx. Publish/feedback send **no
notification** (brief overrides PRD). Ownership derives from `TeacherAssignment` (no
`ownerTeacherId`). 25 procedures (14 `homework.*` + 11 `submission.*`).

| Procedure | T | Permission | Audit | Notes |
|---|---|---|---|---|
| `homework.create` | M | `homework:manage` | ✓ | teacher own subject×section (or admin); validates the pair is staffed; stamps the ACTIVE year |
| `homework.update` | M | `homework:manage` | ✓ | DRAFT: title/desc/dueDate; PUBLISHED: `dueDate` **extend-only**; CLOSED: blocked (§3) |
| `homework.publish` | M | `homework:manage` | ✓ | DRAFT → PUBLISHED (guarded); **requires `dueDate ≥ today` IST** |
| `homework.close` | M | `homework:manage` | ✓ | PUBLISHED → CLOSED (guarded); review/feedback still allowed |
| `homework.reopen` | M | `homework:manage` | ✓ | CLOSED → PUBLISHED; **requires a reason**; clears the close stamp (M5 unlock analog) |
| `homework.delete` | M | `homework:manage` | ✓ | **DRAFT only** (R5 analog); Cascade wipes teacher draft content |
| `homework.get` | Q | `homework:read` | – | read-scoped (teacher own / parent §10 or-clause) |
| `homework.list` | Q | `homework:read` | – | role-aware: admin (year/section) · teacher (own) · parent (PUBLISHED/CLOSED §10) |
| `homework.targets` | Q | `homework:manage` | – | teacher assignable subject×section, name-enriched (create picker + labels; empty for admins) |
| `homework.attachmentUploadUrl` | M (storage) | `homework:manage` | – | mint signed upload; DRAFT-only + MIME/size/count checked before the URL; server-chosen path |
| `homework.attachmentAdd` | M | `homework:manage` | ✓ | persist teacher-file metadata (DRAFT-only) |
| `homework.attachments` | Q | `homework:read` | – | a homework's teacher files (read-scoped) |
| `homework.attachmentDownloadUrl` | M (storage) | `homework:read` | – | mint 300 s signed read after read-authz (§10) |
| `homework.attachmentRemove` | M | `homework:manage` | ✓ | DRAFT-only; metadata only (bytes remain) |
| `submission.submit` | M | `submission:submit` | ✓ | parent own-child; §7 invariants + empty-guard; `isLate` snapshot; unique→`Conflict`; atomic row+attachments |
| `submission.resubmit` | M | `submission:submit` | ✓ | in-place attempt++ (guarded `status,attempt`); PUBLISHED only; **not after REVIEWED** |
| `submission.listByHomework` | Q | `submission:read` | – | teacher review queue (owner-gated); optional status filter |
| `submission.get` | Q | `submission:read` | – | admin / owning teacher / own-child parent |
| `submission.listByEnrollment` | Q | `submission:read` | – | a child's trail — **admin or linked parent only** (teachers use the per-homework queue) |
| `submission.childContext` | Q | `submission:read` | – | parent per-child enrollment + existing submission for a homework (mobile/web submit) |
| `submission.attachmentUploadUrl` | M (storage) | `submission:submit` | – | mint per (homework, enrollment, attempt); §7 authz before the URL |
| `submission.attachments` | Q | `submission:read` | – | a submission's parent files (read-scoped) |
| `submission.attachmentDownloadUrl` | M (storage) | `submission:read` | – | mint 300 s signed read; **never another parent** (R4) |
| `submission.review` | M | `submission:review` | ✓ | RETURNED/REVIEWED + immutable feedback + guarded transition, one tx; allowed after CLOSE |
| `submission.feedback` | Q | `submission:read` | – | a submission's feedback rounds (read-scoped) |

**Not built in M6** (later milestones): homework notifications, un-review correction,
standalone "notes".

## reportCard — Report Card & Academic Results (M7, ADR-014 · implemented)

One flat `reportCard` router on the **protected** gate. `ReportCard` is **Enrollment-owned**
(never Student/Exam/Term — those are scope); `kind` ∈ EXAM/TERM/ANNUAL with nullable
`examId`/`termId` scope. Lifecycle `DRAFT→SUBMITTED→APPROVED→PUBLISHED` (+ `SUPERSEDED`/
`REVOKED`), each a **guarded** transition; the snapshot (attendance %, rank, GPA) is **frozen
at APPROVE** from the canonical M4/M5 services; a correction is a **new version** (option B —
supersede-then-publish in one tx, so never two live PUBLISHED). Authority is admin
(`report_card:manage`); the **class teacher** (`assertClassTeacherOfEnrollment`, ADR-015)
drafts a remark + submits; parents read own-child PUBLISHED. Audit in-tx. No PDF generation /
notifications (deferred). Year-consistency (scope year = enrollment year) is a service invariant.
12 procedures.

| Procedure | T | Permission | Audit | Notes |
|---|---|---|---|---|
| `reportCard.get` | Q | `report_card:read` | – | read-scoped: admin any / class-teacher own-section / parent own-child PUBLISHED; **enriched (M8): `examName`/`termName`/`classTeacherName`** |
| `reportCard.listForEnrollment` | Q | `report_card:read` | – | a student's card trail for one enrollment; **parent → PUBLISHED only**; enriched names (M8) |
| `reportCard.listForSection` | Q | `report_card:read` | – | every card in a `(year, section)`; admin any / the assigned class teacher (same gate as `listForEnrollment`, section grain); **enriched (M8): `studentName`/`rollNo` + names** |
| `reportCard.generate` | M | `report_card:manage` | ✓ | admin; creates (or returns the existing) DRAFT for `(enrollment, kind, scope)`; year-consistency checked; version continues past terminal rows |
| `reportCard.draftRemark` | M | `report_card:remark` | ✓ | the class teacher (scope-gated) sets `classTeacherRemark` while **DRAFT** |
| `reportCard.edit` | M | `report_card:manage` | ✓ | admin; `principalRemark` / `promotionDecision`, **pre-publish only** |
| `reportCard.submit` | M | `report_card:remark` | ✓ | class teacher; DRAFT → SUBMITTED (guarded) |
| `reportCard.approve` | M | `report_card:manage` | ✓ | admin; **SUBMITTED → APPROVED** (skip-state rejected); **freezes the snapshot** |
| `reportCard.reopen` | M | `report_card:manage` | ✓ | admin; SUBMITTED/APPROVED → DRAFT; **requires a reason**; clears stamps + snapshot |
| `reportCard.publish` | M | `report_card:manage` | ✓ | admin; APPROVED → PUBLISHED; **supersedes any prior published version in one tx** |
| `reportCard.revoke` | M | `report_card:manage` | ✓ | admin; PUBLISHED → REVOKED; **requires a reason** |
| `reportCard.correct` | M | `report_card:manage` | ✓ | admin; spawns a new DRAFT `version+1` from a published card (copies authored fields); refuses a second concurrent correction |

**Not built in M7** (later milestones): PDF rendering (the `pdfPath` column + private bucket are
provisioned for it), report-card notifications, CGPA-across-years snapshot, bilingual PDF.

## leave / announcements / messages (PRD-planned — NOT built)

| Procedure | T | Permission | Audit | Notif |
|---|---|---|---|---|
| `leave.apply` | M | `leave:apply` | ✓ | ✓ to class teacher |
| `leave.decide` | M | `leave:decide` | ✓ | ✓ to applicant; on APPROVE upserts Attendance LEAVE (§8.7; calendar B1) |
| `leave.cancel` | M | `leave:apply` (own, PENDING) or `leave:decide` (APPROVED revert) | ✓ | ✓ — **adopted v1.3** (Dev PRD §7); cancelling APPROVED reverts LEAVE rows |
| `leave.listMine` / `listForApproval` | Q | `leave:read` | – | – | cursor |
| `announcements.create` | M | `announcement:create:*` | ✓ | ✓ scoped push |
| `announcements.list` | Q | `announcement:read` | – | – | cursor |
| `messages.createThread` / `send` | M | `message:*` | – | ✓ push to other party |
| `messages.listThreads` / thread messages | Q | `message:*` | – | – | cursor |
| `messages.markRead` | M | own thread | – | – | optimistic |

## notifications / profile / audit / flags

| Procedure | T | Permission | Notes |
|---|---|---|---|
| `notifications.list` / `markRead` | Q/M | `notification:manage_own` | cursor; unread badge from `[userId, readAt]` |
| `notifications.registerDevice` | M | self | upsert on expoPushToken |
| `notifications.deregisterDevice` | M | self | logout cleanup — **adopted v1.3** (Dev PRD §7, B13) |
| `profile.getStudent` / `getStaff` / `update` | Q/M | matrix scopes | child profile for parents |
| `audit.list` | Q | `audit:read` | cursor; filters entityType/actor/date |
| `flags.list` | Q | authenticated | clients need flags to render nav |
| `flags.set` | M | `flags:manage` | ✓ audit |

## Timetable (M9, ADR-017 — implemented)

Permission-only (**no feature flag** — ADR-017 §4). Ownership derives from `TeacherAssignment`
(never `ClassTeacherAssignment`); every mutation audits in-tx. Reads default `academicYearId` to the
ACTIVE year (parents have no `academic:read`); teacher reads default to the caller (own slots only).
Enriched DTOs carry subject/teacher/section names + period timing (batched, no N+1 — ADR-016).

| Procedure | T | Permission | Notes |
|---|---|---|---|
| `bellSchedule.getForYear` | Q | `timetable:read` | the year's single schedule, or null |
| `bellSchedule.create` / `update` | M | `timetable:manage` | one per year (unique); ✓ audit |
| `period.list` | Q | `timetable:read` | ordered by `order` |
| `period.create` / `update` / `delete` | M | `timetable:manage` | overlap/order/time validated; delete blocked if referenced; ✓ audit |
| `timetable.createEntry` / `updateEntry` / `deleteEntry` | M | `timetable:manage` | conflict + ownership + cross-year + break checks; ✓ audit |
| `timetable.bySection` | Q | `timetable:read` | admin any; parent own child's section |
| `timetable.byTeacher` | Q | `timetable:read` | admin any teacher; teacher own only |
| `timetable.forParent` | Q | `timetable:read` | parent's children's section grids |
| `timetable.today` | Q | `timetable:read` | IST weekday; teacher own / parent child |

## Notifications (M10, ADR-018 — implemented)

Permission-only (**no feature flag**). In-app only (no push/SMS/email). Inbox ops are self-scoped
(`userId = self`); every mutation audits in-tx (markRead = read-receipt). Notifications are generated by a
business `*AndNotify` composition wrapping the frozen publish services (post-commit, best-effort) — the
router transport is unchanged in shape; `createAnnouncement` is the one manual admin action.

| Procedure | T | Permission | Notes |
|---|---|---|---|
| `notification.list` | Q | `notification:manage_own` | own inbox; live/archived, keyset-paged (`before`, `limit≤100`) |
| `notification.unreadCount` | Q | `notification:manage_own` | unread & not-archived (badge) |
| `notification.markRead` / `markAllRead` | M | `notification:manage_own` | ✓ audit; 404 on non-owned id |
| `notification.archive` / `unarchive` | M | `notification:manage_own` | soft delete (reversible); ✓ audit |
| `notification.delete` | M | `notification:manage_own` | hard-removes own recipient copy; ✓ audit |
| `notification.createAnnouncement` | M | `announcement:send` | SA/OA; SCHOOL (all active parents+teachers) or SECTION; ✓ audit |

**Event matrix** (post-commit, best-effort; recipients resolved once + stored): homework publish → section
parents (`HOMEWORK_PUBLISHED`); exam publish → exam-section teachers (`EXAM_PUBLISHED`); report-card publish →
the card's parents (`REPORT_CARD_PUBLISHED`); announcement → admin-chosen scope (`ANNOUNCEMENT`). Timetable
(`TIMETABLE_UPDATED`) + study material (`STUDY_MATERIAL`) types reserved, no M10 source (ADR-018 deviations).

## Announcements & Calendar (M11 — ADR-019, implemented; permission-only)

Persistent school communication. Thin transport → business enforces permission, targeting/visibility, lifecycle,
storage signing, in-tx audit, and the optional post-commit M10 notification. `announcement.publish` reuses the M10
`createBulkNotification` (best-effort; `notify:false` = silent). Attachment mints run full authz before any URL
exists (ADR-004). Per-user announcement targeting is a business filter (RLS is coarse; ADR-019 §6).

| Procedure | T | Permission | Notes |
|---|---|---|---|
| `announcement.list` | Q | `announcement:read` | role-aware: admin all-of-status; teacher DRAFT→own; else published+targeted (repo WHERE) |
| `announcement.get` | Q | `announcement:read` | targeting-gated (404, no existence leak) |
| `announcement.create` | M | manage / draft | admin any scope; teacher own SECTION/CLASS; DRAFT; ✓ audit |
| `announcement.update` | M | manage / draft (own draft) | DRAFT-only (published immutable); ✓ audit |
| `announcement.publish` | M | `announcement:manage` | SA/OA; DRAFT→PUBLISHED; optional M10 notify (`notify` arg); ✓ audit |
| `announcement.archive` | M | `announcement:manage` | SA/OA; PUBLISHED→ARCHIVED (soft delete); ✓ audit |
| `announcement.delete` | M | manage / draft (own draft) | DRAFT-only hard delete (+ attachments, one tx); ✓ audit |
| `announcement.attachmentUploadUrl` | M | `announcement:read` (+author) | mint signed upload (DRAFT-only, count-guarded) |
| `announcement.attachmentAdd` | M | `announcement:read` (+author) | persist metadata (DRAFT-only); ✓ audit |
| `announcement.attachmentDownloadUrl` | M | `announcement:read` | mint signed read **after** full targeting check (R4 guard) |
| `announcement.attachmentRemove` | M | `announcement:read` (+author) | DRAFT-only; ✓ audit |
| `calendar.get` / `month` / `range` / `upcoming` | Q | `calendar:read` | all in-scope roles; school-wide (no targeting) |
| `calendar.create` / `update` / `delete` | M | `academic:manage` | admin; range-validated; ✓ audit |

## Student Discipline & Leave (M12 — ADR-020, implemented; permission-only)

Behaviour incidents over frozen M1–M11 + the **frozen M4 leave** workflow's notification wrap. Thin transport → business
enforces permission, author/read scope, the lifecycle transition graph, in-tx audit, and the optional post-commit M10
notification. Leave is **not re-implemented** — `leave.decide` (M4 router) was **repointed** to `decideLeaveAndNotify`
(the frozen `decideLeave` is byte-identical; the composer notifies the parent).

| Procedure | T | Permission | Notes |
|---|---|---|---|
| `behaviour.list` | Q | `behaviour:manage` | admin console; filters student/teacher/severity/status |
| `behaviour.listByStudent` | Q | `behaviour:read` | admin all; teacher own-section; parent own child |
| `behaviour.listByTeacher` | Q | `behaviour:read` | the acting teacher's own referrals (teacherId = self) |
| `behaviour.get` | Q | `behaviour:read` | scope-gated (admin / owning teacher / own-section / own-child) |
| `behaviour.create` | M | manage / record | admin names teacher; teacher `teacherId=self` + own-section, ACTIVE-year enrollment derived; OPEN; optional M10 BEHAVIOUR notify; ✓ audit |
| `behaviour.update` | M | manage / record (own) | OPEN↔IN_PROGRESS only; CLOSED immutable; ✓ audit |
| `behaviour.resolve` | M | manage / record (own) | →RESOLVED (stamps resolver); ✓ audit |
| `behaviour.close` | M | manage / record (own) | →CLOSED (terminal; self-stamps if unresolved); ✓ audit |
| `leave.decide` *(M4 router, M12 repoint)* | M | `leave:decide` | approve/reject → `decideLeaveAndNotify`: frozen decide + post-commit M10 LEAVE notify to the parent |

## Fees & Payments (M13 — ADR-021, implemented; permission-only)

Fee structures, invoice generation, partial payments, receipts over frozen M1–M12 — the **first money domain** (all
amounts are `Int` paise). Thin transport → business enforces permission, scope, the invoice lifecycle, the snapshotted
total, guarded money movement, race-safe numbering, in-tx audit, and the post-commit M10 notification. **No online
gateway, refunds, or concessions** (deferred). Supersedes the planned flag-gated `fees.*` add-on below.

| Procedure | T | Permission | Notes |
|---|---|---|---|
| `fee.listStructures` | Q | `fee:manage` | admin; filter academicYearId/active |
| `fee.getStructure` | Q | `fee:manage` | one structure + its components |
| `fee.createStructure` | M | `fee:manage` | name + per-year components (paise); ✓ audit |
| `fee.updateStructure` | M | `fee:manage` | rename / (de)activate / replace components (future invoices only — snapshot); ✓ audit |
| `fee.listInvoices` | Q | `fee:manage` | admin console; filters student/enrollment/structure/status/**academicYear/section** |
| `fee.listInvoicesByStudent` | Q | `fee:read` | student ledger — admin all; teacher own-section; parent own child |
| `fee.getInvoice` | Q | `fee:read` | scope-gated; status is derived OVERDUE on read |
| `fee.generateInvoices` | M | `fee:manage` | bulk per section from a structure; **idempotent** (skips existing); total **snapshotted**; race-safe number; ✓ audit |
| `fee.issueInvoice` | M | `fee:manage` | DRAFT→ISSUED; post-commit M10 INVOICE_ISSUED → parents; ✓ audit |
| `fee.cancelInvoice` | M | `fee:manage` | DRAFT/ISSUED (unpaid) → CANCELLED (terminal); ✓ audit |
| `payment.record` | M | `payment:record` | ISSUED/PARTIAL → PARTIAL/PAID (guarded, atomic); race-safe receipt; overpay/wrong-state rejected; M10 PAYMENT_RECEIVED → parents; ✓ audit |
| `payment.receipt` | Q | `payment:read` | one receipt (payment + invoice) by paymentId; scope-gated |
| `payment.listByInvoice` | Q | `payment:read` | payment history for an invoice; scope-gated |
| `payment.list` | Q | `payment:read` | admin-only school-wide log; filters method/date |

## Analytics & Reporting (M14 — ADR-022, implemented; permission-only)

Read-only analytics/dashboards over frozen M1–M13. All procedures are **queries** on the **protected** gate — thin
transport, no writes, no audit, **ZERO schema change**. **No new permission:** each query authorizes by reusing the
underlying domain read + scope (`attendance`/`marks`/`fee`/`report_card`/`behaviour`/`student:read`); **school-wide
panels are admin-only** (SA/OA guard). Aggregates are **compute-on-read** (no summary tables/cron). Supersedes the
planned flag-gated `analytics.*` add-on below.

| Procedure | T | Permission | Notes |
|---|---|---|---|
| `analytics.studentSummary` | Q | domain reads (`{studentId}`, own-child/section scope) | one student's KPIs (attendance %, GPA, dues) |
| `analytics.examTrend` | Q | `marks:read` (`{studentId}`) | a student's marks trend across exams |
| `analytics.attendanceTrend` | Q | `attendance:read` (`{studentId}`) | a student's attendance % over time |
| `analytics.teacherSummary` | Q | domain reads (self scope) | the acting teacher's sections at a glance |
| `analytics.classPerformance` | Q | `marks:read` (`{sectionId}`, own-section) | one section's performance distribution |
| `analytics.schoolSummary` | Q | admin-only | school-wide KPIs |
| `analytics.feeCollection` | Q | `fee:read` (admin-only) | collection/outstanding; optional `{academicYearId?}` |
| `analytics.topPerformers` | Q | `marks:read` (admin-only) | top students; optional `{limit?}` |
| `analytics.atRiskStudents` | Q | admin-only | low attendance/marks + open behaviour flags |
| `analytics.dashboard` | Q | role-aware (reuses domain reads) | the caller's role dashboard payload (KPIs + series) |

## Documents, Certificates & Downloads (M15 — ADR-023, implemented; permission-only)

Per-student document center over frozen M1–M14 — issued certificates + uploaded files with an approval lifecycle. Thin
transport → business enforces permission, scope, the lifecycle (GENERATED/UPLOADED→APPROVED→ARCHIVED, delete-drafts-only),
the frozen generation `snapshotJson`, the **APPROVED-only** visibility gate for non-admins, in-tx audit, and **60s**
signed-URL minting. Two new tables (`Document`/`DocumentTemplate`), new private bucket `documents`. Generation is
**metadata-first** (no PDF renderer; GENERATED docs carry a snapshot, no file until rendering lands — the upload path is
fully working). Distinct from M3 `studentDocument.*` (KYC uploads).

| Procedure | T | Permission | Notes |
|---|---|---|---|
| `document.generate` | M | `document:manage` | GENERATED; freezes system-sourced `snapshotJson` (name/admissionNo + current class/section/year); no file in v1; ✓ audit |
| `document.uploadUrl` | M | `document:manage` (storage) | mint one-time signed **upload** URL (server-chosen path, `documents` bucket); PRECONDITION_FAILED if storage unwired |
| `document.createUploaded` | M | `document:manage` | record an UPLOADED doc after the file is pushed to the signed URL; ✓ audit |
| `document.approve` | M | `document:approve` | draft (GENERATED/UPLOADED) → APPROVED (visibility gate); ✓ audit |
| `document.archive` | M | `document:manage` | APPROVED → ARCHIVED (soft-retire, terminal); ✓ audit |
| `document.deleteDraft` | M | `document:manage` | hard-delete a draft only (approved/archived never deleted); ✓ audit |
| `document.list` | Q | `document:manage` | admin console — school-wide; filters student/type/status |
| `document.listStudentDocuments` | Q | `document:read` | a student's docs — admin all; teacher own-section / parent own-child **APPROVED-only** |
| `document.downloadUrl` | M | `document:read` (storage) | mint 60s signed **read** URL; scope + APPROVED-only gate run first; no-file → CONFLICT |
| `documentTemplate.list` | Q | `document:manage` | certificate templates (admin picker) |
| `documentTemplate.create` | M | `document:manage` | new per-type template; ✓ audit |
| `documentTemplate.update` | M | `document:manage` | rename / (de)activate; ✓ audit |

## Add-on routers (flag-gated: check flag → FORBIDDEN when off)

| Procedure | Flag | T | Permission | Audit | Notif |
|---|---|---|---|---|---|
| ~~`fees.structures.*` / `fees.invoices.*` (`fees` flag)~~ | — | — | — | — | **SUPERSEDED** by the Fees & Payments section above (M13/ADR-021 — permission-only, `fee.*`/`payment.*`, no flag) |
| ~~`fees.createOrder` / `fees.verifyPayment` (`fees` flag, Razorpay)~~ | — | — | — | — | **DEFERRED** — no online gateway in M13 (out of scope) |
| ~~`fees.reminders.send` (`fees` flag)~~ | — | — | — | — | **DEFERRED** — overdue reminders are future (M13 OVERDUE is compute-on-read) |
| ~~`timetable.* CRUD + publish` (`timetable` flag)~~ | — | — | — | — | **SUPERSEDED** by the Timetable section above (M9/ADR-017 — permission-only, no publish/notify) |
| `analytics.attendanceTrends` / `resultDistribution` / `classPerformance` | `analytics` | Q | `analytics:view` | – | – |

## Non-tRPC HTTP routes

| Route | Purpose |
|---|---|
| `GET /api/health` | liveness (implemented) |
| `GET /api/ready` | readiness (implemented) |
| `POST /api/webhooks/razorpay` | `fees` — HMAC-verified, idempotent by `razorpayOrderId`; updates Payment/Invoice + audit |

## Scheduled jobs (Supabase cron — all idempotent, re-run safe)

| Job | Schedule | Does | Guards |
|---|---|---|---|
| Absence notifier | daily, after configurable cutoff (SchoolSettings, B4) | push (+SMS/WA if flagged) to guardians of students ABSENT today with no notification yet | once per student/day; skips holidays (B1); IST date |
| Fee reminders (`fees`) | daily | dues/overdue reminders per policy | idempotent per invoice/day |
| Invoice overdue sweep (`fees`) | daily | PENDING/PARTIAL past dueDate → OVERDUE | status transition only |
| Device-token prune | weekly | remove tokens with `DeviceNotRegistered` receipts — **adopted v1.3** (Dev PRD §8.9) | – |

## Notification event matrix (channel policy — ADR-005, PRD v2 §9)

| Event | Recipients | In-app | Push | SMS | WhatsApp* | Deep link (see NAVIGATION_MAP) |
|---|---|---|---|---|---|---|
| Absence (post-cutoff) | guardians of student | ✓ | ✓ | ✓ critical | ✓ | child attendance |
| Homework posted | division guardians | ✓ | ✓ | – | – | homework detail |
| Marks published | division guardians | ✓ | ✓ | – | – | child marks |
| Report card ready | guardians | ✓ | ✓ | – | – | report card |
| Announcement | scope audience | ✓ | ✓ | – | – | announcement detail |
| Message received | other party | ✓ | ✓ | – | – | thread |
| Leave applied | class teacher | ✓ | ✓ | – | – | approval list |
| Leave decided | applicant | ✓ | ✓ | – | – | leave detail |
| Fee due/overdue (`fees`) | guardians | ✓ | ✓ | ✓ | ✓ | invoice |
| Payment receipt (`fees`) | payer | ✓ | ✓ | – | ✓ | receipt |
| OTP / account | user | – | – | ✓ (Supabase provider) | – | – |

*WhatsApp only when `whatsapp` flag on; template messages via Gupshup. All copy localized per `User.locale`.
