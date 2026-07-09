# Feature — Attendance Management (M4)

Feature-specific rules. References the PRD/ADR; does not duplicate them.
Spec: M4 kickoff brief · **ADR-011 (attendance data ownership)** · ADR-010
(enrollment) · Dev PRD v1.3 §8.4/§8.7/§8.19 · `docs/milestones/M4.md` ·
`docs/PERMISSIONS_MATRIX.md` · `docs/RLS_POLICIES.md`.

## Entities & ownership (ADR-011)

Attendance keys to **`Enrollment`, never `Student`** (ADR-010 §8) — so a mark
carries its year/class/section context and **history survives promotion**
(promotion creates a new enrollment; last year's records stay attached to the
old row). Five entities:

- **`AttendanceSession`** — one register event: `(academicYear, section,
  subject?, sessionType, date)` + lifecycle `status` + audit actors
  (`createdBy/submittedBy/lockedBy` → Staff). `sessionType ∈ {DAILY, SUBJECT}`
  (SUBJECT is schema-ready for future period attendance; UI is daily-first).
- **`AttendanceRecord`** — one student's mark within a session:
  `sessionId → AttendanceSession`, `enrollmentId → Enrollment`, `status`,
  optional `remarks`. `status ∈ {PRESENT, ABSENT, LATE, HALF_DAY, LEAVE}`.
- **`LeaveRequest`** — `enrollmentId`, `parentId`, `fromDate/toDate`, `reason`,
  `status ∈ {PENDING, APPROVED, REJECTED, CANCELLED}`.
- **`AttendanceCorrection`** — immutable request against a record: snapshots
  `previousStatus` + `requestedStatus`, `reason`, `status ∈ {PENDING, APPROVED,
  REJECTED}`.
- **`Holiday`** — `academicYearId`, `name`, `date`, `type ∈ {NATIONAL, SCHOOL,
  FESTIVAL, EMERGENCY_CLOSURE}`.

`AttendanceSummary` is **not a table** — it's a compute-on-read business service.

## Invariants (DB + business, both layers)

- **One register per `(section, date, sessionType, subject)`** — two partial
  unique indexes (DAILY where `subjectId IS NULL`; SUBJECT where not null) close
  the Postgres NULL-distinct gap.
- **One mark per `(session, enrollment)`** (unique) — marking is an idempotent
  upsert (offline-replay / double-tap safe), never a duplicate.
- **Lifecycle is forward-only** `DRAFT → SUBMITTED → LOCKED`; there is no revert
  operation. `markAttendance` is **DRAFT-only**; a SUBMITTED/LOCKED register
  changes only through an approved correction.
- **Attendance only for ACTIVE enrollments in the section** — blocks marking
  another section, a withdrawn student, or a promoted (old-year) row.
- **No attendance on a holiday** — session creation consults a working-day
  resolution (weekday baseline − Holiday); the make-up-day override layer is
  designed-in but unbuilt in M4 (a holiday is a hard block).
- **Approved leave never writes attendance** (ADR-011 §7) — it only biases the
  roster's *suggested* default to LEAVE; the marker may override.
- **Corrections never overwrite silently** — the request is immutable; approval
  applies `requestedStatus` in one audited transaction, guarded by an optimistic
  check that the record still holds `previousStatus`.
- **Concurrency-safe**: session create (DB partial-unique), record mark
  (idempotent upsert), and state transitions + correction approval (guarded
  conditional `updateMany WHERE status=<from>`, row-locked) each apply exactly
  once — the loser gets `Conflict`, no double-audit.
- **`markedBy`/actor FKs require a `Staff` row** (REVIEW_FINDINGS B3) — resolved
  once per mutation; a marking user without one gets a clean ValidationError.
- Every attendance mutation writes `AuditLog` **in the same transaction**.

## Attendance summary (compute-on-read, ADR-011 §10)

Canonical weighting, the single source of truth for every % in the product:
`PRESENT = 1.0`, `LATE = 1.0` (attended; surfaced separately), `HALF_DAY = 0.5`,
`ABSENT = 0`, `LEAVE` **excluded** from the denominator. `percentage =
Σ(weights) / (records excluding LEAVE)`, `null` when there are no countable
days. Term/annual % for a report card (ADR-009) is then a pure aggregation over
`enrollmentId` + an `AcademicTerm` range — no per-report placement logic. No
summary table, no cron.

## Authorization (permission + ROW scope, business layer)

- Permissions: `attendance:mark/read`, `attendance:correct:submit/decide`,
  `leave:apply/decide/read`, `holiday:read` (writes ride `academic:manage`).
- SUPER_ADMIN + OFFICE_ADMIN: full management. TEACHER: mark + read + submit
  corrections for **own sections**, read own-section leave, read the calendar.
  PARENT: read **own child's** attendance, apply for + read own leave, read the
  calendar. ACCOUNTANT: none.
- **Ownership derives from `TeacherAssignment`** (never stored on the session).
  Daily-session scope is section-level (any assignment to the section);
  class-teacher-only tightening awaits the deferred class-teacher flag.
- Approve/reject (leave + corrections) are **admin decisions** — web only; no
  decide-queues on mobile.
- RLS (defense-in-depth only — Prisma bypasses): admin ALL; teacher
  own-assigned-section SELECT (session/record/leave/correction); parent
  own-child SELECT (record/leave); the holiday calendar is readable by any
  authenticated user. Anon: nothing.

## API

Four thin routers on `protectedProcedure`: `attendance.* / leave.* /
attendanceCorrection.* / holiday.*` (see `API_INVENTORY.md`). Zod inputs in
`@repo/validation` (shape only — rules stay in services). Two reads added for
the marking flow: `attendance.findSession` (open-vs-resume without a side
effect) and `attendanceCorrection.listMine` (a teacher's own submissions).

## UI

- **Web (admin dashboard):** `/attendance/{mark,summary,leave,corrections,
  holidays}` with permission-filtered tabs. Mark = section + date-picker →
  find-or-open register → bulk "mark all present" + per-student status → save →
  submit → lock, with CSV export. Summary = section + range → per-student %.
  Leave + correction **approval queues** (enriched with student names). Holiday
  calendar CRUD.
- **Mobile:** teacher — mark (find-or-open → roster → save/submit/lock),
  attendance history, my corrections (read-only) + submit-correction from a
  record row. Parent — child attendance + calendar (chronological list with
  holidays overlaid), apply leave + leave status. No admin CRUD. Calendar =
  list (not a grid widget); dates = `YYYY-MM-DD` text inputs.

## Tests

Business rules with mocked repositories (`attendance.services.test.ts` +
`attendance.concurrency.test.ts`): session/mark/leave/correction/holiday
workflows, the full edge-case bank (duplicate session, another-section,
another-child, post-withdrawal/promotion, holiday, late/half-day, bulk
rollback), a state-machine matrix, and **real `Promise.all` concurrency** races.
Transport gates + Zod (`packages/api/.../attendance.test.ts`) incl. a
parameterized **authorization matrix** (every procedure × every role). Input
schemas (`@repo/validation/attendance.test.ts`). DB constraints are the race
backstop (verified empirically in Steps 2–4).
