# ADR-011 — Attendance data ownership (Enrollment-owned, session-based)

**Status:** Accepted · **Date:** 2026-07 · **Deciders:** Architecture, Product
**Related:** ADR-010 (Enrollment is the join point) · ADR-007 (audit) · ADR-008 (loose `schoolId`) · ADR-009 (ReportCard→Enrollment) · Dev PRD v1.3 §8.4/§8.7 · REVIEW_FINDINGS B1 (holiday model), B2 (leave×period), B3 (marker identity)
**Precedes:** M4 (Attendance Management) implementation — this ADR defines the model; no code is written here.

## Context

M4 is the first module to hang time-scoped records off ADR-010's `Enrollment`. Two
questions must be settled before any table is designed:

1. **Who owns an attendance fact?** The naïve answer is "the student." The correct
   answer — already committed to in ADR-010 §8 — is **the enrollment**: attendance is
   a fact about *a student's membership in a section during a specific academic year*,
   not about the person.
2. **What shape does a day's marking take?** The Dev PRD §8.4 spec'd a **flat**
   `Attendance` table keyed `[enrollmentId, date, period]` with a `period = 0`
   whole-day sentinel. The M4 kickoff brief supersedes that with a **session-based**
   model: an `AttendanceSession` header (one marking event: section × date × session
   type × optional subject) owning `AttendanceRecord` lines (one per enrollment).
   As with ADR-010's vocabulary reconciliation, the kickoff brief is the tiebreaker;
   this ADR records why the session model is also the better design, not just the
   mandated one.

## Decision

### 1. Attendance belongs to Enrollment, never Student

`AttendanceRecord.enrollmentId → Enrollment`. There is **no** `studentId` column on
any attendance table. A student's attendance for a year is reachable only through
that year's enrollment row.

*Why:* an attendance fact is meaningless without its year/class/section context —
"present on 2026-08-01" only means something as "present in Grade 5-A during
2026–27." `Enrollment` *is* that context (ADR-010 §3). Keying by `studentId` would
force every query to re-derive the year, and would leave records dangling across
year boundaries.

### 2. History survives promotion by construction

Promotion (ADR-010 §4) marks the old enrollment `PROMOTED` and creates a **new**
row for the next year — the old row is never mutated. Because attendance FKs the
old row, the 2025–26 attendance stays attached to the 2025–26 enrollment forever:

- Promotion requires **zero** attendance writes — no re-pointing, no copying.
- Year-over-year history is `student.enrollments[].attendanceRecords[]` — one
  indexed walk, each year's records still bound to the class/section as lived.
- Report cards (ADR-009, `ReportCard.enrollmentId`) read the attendance % of *their
  own* enrollment; a generated card can never drift when the student advances.
- `onDelete: Restrict` from attendance into Enrollment (and from Enrollment into
  Student/Year/Class/Section, already shipped) means no cascade can orphan history.

Retention and withdrawal fall out the same way: a `RETAINED`/`DROPPED` enrollment
keeps its records; the new (or absent) enrollment starts empty.

### 3. Session-based model, not a flat per-record table

```
AttendanceSession  (one marking EVENT: year × section × date × sessionType × subject? × teacher × status)
  └─< AttendanceRecord (one LINE per enrollment: status PRESENT/ABSENT/LATE/HALF_DAY/LEAVE)
```

- **Duplicate prevention moves to the header**: one session per
  (section, date, sessionType, subject) — "did 5-A get marked this morning?" is a
  header lookup, and two teachers racing to mark the same section collide on the
  header unique, not on N row upserts.
- **Marking metadata has a home**: who marked, when, session status — facts about
  the *event*, which the flat model had to denormalize onto every row (PRD's
  `markedByStaffId` per record — B3's pain point).
- **Subject attendance is future-ready without period numbers**: a subject session
  is just `sessionType = SUBJECT` + a non-null `subjectId`. The PRD's `period 1..N`
  integers (and the B2 sentinel gymnastics they forced) are retired.
- **Bulk marking is naturally atomic**: create header + all lines in one
  transaction; re-saving updates lines under the same header (idempotent).

### 4. Holidays are calendar rows, not an attendance status

`Holiday(academicYearId, date, name, type)` is the source of truth for non-working
days (resolves B1). The status enum is **PRESENT / ABSENT / LATE / HALF_DAY /
LEAVE** — the PRD's `HOLIDAY` status is dropped: a holiday is the *absence of a
session*, not a per-student mark. Business rule: session creation on a holiday
date is rejected unless explicitly overridden (audited) — schools do occasionally
hold working days on planned holidays.

### 5. Leave resolution — the B2 invariant, restated for sessions

`LeaveRequest` FKs **Enrollment** (kickoff brief; supersedes the PRD's
`studentId` keying) plus the requesting Parent. On approval:

- For each school day in `[fromDate, toDate]` (weekday check + no Holiday row):
  - sessions that **already exist** → upsert that enrollment's record to `LEAVE`;
  - sessions **created later** for a covered date → pre-fill that enrollment's
    record as `LEAVE` at session-creation time.
- Rejection/cancellation of a previously-approved leave reverts only rows the
  leave wrote (audited).

Because every write lands *inside a session*, the contradictory-rows problem B2
described (day-level LEAVE coexisting with period-level PRESENT) cannot be
expressed — there is exactly one record per (session, enrollment).

### 6. Corrections are append-only workflow rows

`AttendanceCorrection(attendanceRecordId, requestedBy, reason, status)` with
`PENDING → APPROVED / REJECTED`. Approval updates the target record's status **and**
writes the audit row in the same transaction; the correction row itself keeps the
before/after pair. History is never silently overwritten — a record's current value
is always explainable by its correction chain + AuditLog (ADR-007).

## Alternatives considered

**A. Flat `Attendance[enrollmentId, date, period]` (Dev PRD §8.4) — REJECTED.**
Workable (it was the accepted design pre-M4) but: the `period 0` sentinel exists
only to make a unique index behave; marker/event metadata must repeat per row;
duplicate-session detection is N-row, not one-header; and subject attendance needs
a period-number convention with no natural meaning. The session model expresses
the same facts with the event reified. Superseded by the M4 kickoff brief.

**B. `AttendanceRecord.studentId` (attendance on the person) — REJECTED.**
The ADR-010 Alternative-A anti-pattern one table over: records survive promotion
only by re-pointing or losing their year context, per-year percentage queries need
a date→year resolution on every read, and withdrawal semantics get ambiguous.
Rejected outright; this is the invariant the milestone brief states twice.

**C. Both `enrollmentId` and a denormalized `studentId` — REJECTED.**
Saves one join on parent reads but creates a consistency obligation with no
lifecycle payoff (an attendance row never outlives its enrollment). ADR-010
accepted denormalized `classId` because of the null-section case; no analogous
case exists here.

## Consequences

- (+) Promotion/retention/withdrawal need **no attendance migration ever**; history
  is immutable per-year by construction (§2).
- (+) One join point (`enrollmentId`) keeps report cards, analytics, and parent
  views year-correct automatically; teacher/parent RLS scope derives from the
  session's section / the enrollment's student, mirroring M3's people_rls shapes.
- (+) B1, B2, B3 are all closed by the model itself (Holiday table; per-session
  records; teacher on the session header).
- (−) Reads for "a student's attendance on a date" now traverse
  session → record; mitigated by indexing records by `enrollmentId` and sessions
  by `(sectionId, date)`.
- (−) The PRD's `period` encoding and `HOLIDAY` status are superseded — Dev PRD
  §8.4/§8.7 readers must treat this ADR as the current shape (same precedent as
  ADR-010's vocabulary reconciliation).
- (−) Leave pre-fill at session creation is an extra service responsibility
  (§5) — the price of allowing leave approval before sessions exist.
