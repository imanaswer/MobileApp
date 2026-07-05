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
| `teacherProfile.list` / `get` | Q | `staff:read` | – | TEACHER → own profile only |
| `teacherProfile.create/update/delete` | M | `staff:manage` | ✓ | employeeId unique/school; 1:1 User (no auth duplication) |
| `enrollment.listByStudent` | Q | `enrollment:read` | – | full history (never mutated); student-scoped |
| `enrollment.sectionRoster` | Q | `enrollment:read` | – | teacher → only sections they teach; parent → none |
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
| `academic.holidays.*` (list/create/delete) | Q/M | `academic:manage` | ✓ | school calendar (Dev PRD §8.19); optional class scope |
| `academic.settings.get/update` | Q/M | `academic:manage` | ✓ | typed `SchoolSettings` (attendance mode, periods, cutoff, working weekdays) |
| `classSubjects.*` (class↔subject mapping) | Q/M | `academic:manage` | ✓ | with class-teacher flag on assignments |
| `enrollment.promoteBulk` | M | `enrollment:manage` | ✓ | retain/transfer overrides; dry-run mode recommended |

## attendance (M4 — next)

| Procedure | T | Permission | Audit | Notif |
|---|---|---|---|---|
| `attendance.markBulk` | M | `attendance:mark` | ✓ (changed rows) | – (absence push is the job's) |
| `attendance.getByDivisionDate` | Q | `attendance:read` | – | – |
| `attendance.studentSummary` | Q | `attendance:read` | – | – (daily/monthly/term %) |

`markBulk` upserts on `[enrollmentId, date, period]` — idempotent, safe for offline replay.

## exams (M4)

| Procedure | T | Permission | Audit | Notif |
|---|---|---|---|---|
| `exams.createExam` / `defineExamSubjects` | M | `exam:manage` | ✓ | – |
| `exams.gradeScale.*` (CRUD scales/bands) | Q/M | `exam:manage` | ✓ | – |
| `exams.enterMarksBulk` | M | `marks:enter` | ✓ (per mark edit) | – |
| `exams.getMarks` / `results` | Q | `marks:read` | – | – |
| `exams.publishResults` | M | `exam:manage` | ✓ | ✓ push "marks published" — **adopted v1.3** (Dev PRD §7): marks become parent-visible only on publish |
| `exams.generateReportCard` | M | `reportcard:generate` | ✓ | – (upsert per ADR-009) |
| `exams.getReportCard` | Q | `reportcard:read` | – | – (mints signed URL, B7) |

## homework / leave / announcements / messages (M5)

| Procedure | T | Permission | Audit | Notif |
|---|---|---|---|---|
| `homework.create` | M | `homework:create` | – | ✓ push to division's guardians |
| `homework.listForDivision` | Q | `homework:read` | – | – | cursor |
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

## Add-on routers (flag-gated: check flag → FORBIDDEN when off)

| Procedure | Flag | T | Permission | Audit | Notif |
|---|---|---|---|---|---|
| `fees.structures.*` / `fees.invoices.*` | `fees` | Q/M | `fees:manage`/`fees:view` | ✓ | invoice issued → push |
| `fees.createOrder` | `fees` | M | `fees:pay` | ✓ | – (Razorpay order) |
| `fees.verifyPayment` | `fees` | M | `fees:pay` | ✓ | ✓ receipt |
| `fees.reminders.send` | `fees` | M | `fees:manage` | ✓ | ✓ push+SMS/WA |
| `timetable.*` CRUD + `publish` | `timetable` | Q/M | `timetable:*` | ✓ (publish) | publish → push |
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
