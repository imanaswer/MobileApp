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

## students / guardians / staff (M2)

| Procedure | T | Permission | Audit | Notif | Pagination |
|---|---|---|---|---|---|
| `students.list` | Q | `student:read` | – | – | cursor (search/filter by class/division/status) |
| `students.get` | Q | `student:read` | – | – | – |
| `students.create` / `update` | M | `student:create/update` | ✓ | – | |
| `students.archive` | M | `student:archive` | ✓ | – | lifecycle, not delete |
| `students.bulkImport` | M | `import:run` | ✓ (ImportJob) | – | async; per-batch transactions |
| `guardians.create` / `linkToStudent` / `invite` | M | `guardian:*` | ✓ | invite → SMS/notification | |
| `guardians.list` | Q | `student:read` | – | – | cursor |
| `staff.create` / `update` / `assign` | M | `staff:*` | ✓ | – | assign = TeacherAssignment incl. isClassTeacher |

## academic / enrollment (M2)

| Procedure | T | Permission | Audit | Notes |
|---|---|---|---|---|
| `academic.academicYears.*` (CRUD + setCurrent) | Q/M | `academic:manage` | ✓ | setCurrent = transactional flip; partial unique index enforces one current (v1.3) |
| `academic.holidays.*` (list/create/delete) | Q/M | `academic:manage` | ✓ | school calendar (Dev PRD §8.19); optional classLevel scope |
| `academic.settings.get/update` | Q/M | `academic:manage` | ✓ | typed `SchoolSettings` (attendance mode, periods, cutoff, working weekdays) |
| `academic.classLevels.*` / `divisions.*` / `subjects.*` / `classSubjects.*` / `teacherAssignments.*` | Q/M | `academic:manage` | ✓ (mutations) | reads open to staff roles |
| `enrollment.enroll` / `transfer` / `drop` | M | `enrollment:*` | ✓ | |
| `enrollment.list` | Q | `student:read` | – | offset OK (bounded roster) |
| `enrollment.promoteBulk` | M | `enrollment:promote_bulk` | ✓ | retain/transfer overrides; dry-run mode recommended |

## attendance (M3)

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
