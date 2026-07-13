# ADR-013 — Homework & Assignment Management (M6)

**Status:** Accepted — **M6 implemented** (Steps 1–10 shipped 2026-07-10; awaiting milestone approval) · **Date:** 2026-07-10 · **Deciders:** Architecture, Product

> **Implementation note (Step 10).** Shipped as specified with one deliberate
> deviation from §9: the **parent submission upload path is keyed by
> `{schoolId}/submission/{homeworkId}/{enrollmentId}/{attempt}/…`** (not
> `{submissionId}` as sketched) so a submit is a single atomic transaction — the
> submission row and its attachment metadata persist together, and the mint needs no
> pre-existing submission row. Same private / server-chosen / attempt-tagged
> properties; no behavioural change. Also: mobile ships the text loop + attachment
> **download**; parent file **upload is now on mobile too** (Phase 3 — expo-image-
> picker/expo-document-picker → the same mint→PUT→confirm flow as web). The
> OFFICE_ADMIN create-from-scratch web picker is unbuilt (service supports it) —
> recorded in `docs/features/homework.md` §Known limitations.
**Related:** Dev PRD v1.3 §8.6 (homework — superseded in part by the M6 brief, see below) ·
ADR-002 (business layer is the authorization gate) · ADR-003 (repositories) ·
ADR-004 (private Storage + signed URLs — homework attachments are its founding use case) ·
ADR-007 (audit) · ADR-008 (loose `schoolId`) · ADR-010 (Enrollment is the join point) ·
ADR-011 (register/actor patterns) · ADR-012 (publication + audited-reopen patterns) ·
PERMISSIONS_MATRIX §Homework (planned rows — revised here) · DATABASE_CONVENTIONS
**Precedes:** M6 (Homework & Assignment Management) implementation — this ADR defines the
model and the Step-1 decisions; **no code is written here.**

## Context

M6 adds the first **bidirectional content module**: a teacher publishes an assignment
(with files), a **parent** submits work for their child (with files), and the teacher
reviews and gives feedback. Prior milestones supply every pattern this needs:
Enrollment as the join point (ADR-010), derived teacher ownership + audit actors + a
status lifecycle (ADR-011), a publication gate + audited backward transition
(ADR-012), and private-bucket storage with server-minted signed URLs (ADR-004 — whose
context literally opens with "homework attachments").

**Scope conflict, resolved by the brief (read this first).** Dev PRD v1.3 §8.6 and
decision log #13 made homework **distribution-only** ("no online submission/upload;
digital uploads would be a separate paid add-on `homework-uploads`"), and
`REVIEW_FINDINGS A3` flagged the product PRD's "submissions" wording as a
contradiction to fix. The **M6 kickoff brief explicitly reverses this**: Homework
Submissions, Submission Attachments, Parent submissions, Teacher review, and Feedback
are all **core M6 scope**. As with M5's publish-notify (brief overrode PRD), **the
brief wins**. Consequences adopted here:

- Submissions are **core** — **no `homework-uploads` feature flag** (ADR-006 gates
  commercial add-ons; the brief makes this core product, so flag-gating it would
  contradict the scope decision).
- `docs/features/homework.md`, `docs/status/Homework.md`, and the PRD-planned
  permission rows are corrected in Step 10.
- **No Student login exists** — the submitting actor is always a **Parent** (portal
  parent with a `User` link). "Student submits" is not a modelled action.

Out of scope (brief): notifications/push, chat/discussion threads, **grading/marks on
homework**, plagiarism, report cards, attendance, exams, timetable. Publish sets
state only (M5 precedent); feedback is **text-only** (no score fields — grading is
excluded, and adding a score column now would smuggle grading in).

## Decision

### 1. Hierarchy and grain

```
Homework              the assignment — Subject × Section, year-scoped; owns the
  │                   DRAFT → PUBLISHED → CLOSED lifecycle + publication (parent
  │                   visibility). Ownership DERIVED from TeacherAssignment.
  ├─< HomeworkAttachment      teacher-side files (metadata; bytes in Storage, ADR-004)
  └─< HomeworkSubmission      per ENROLLMENT (never Student) — unique
        │                     (homeworkId, enrollmentId); SUBMITTED → RETURNED →
        │                     RESUBMIT… → REVIEWED; submitted by a Parent actor.
        ├─< SubmissionAttachment   parent-side files, append-only, tagged by attempt
        └─< HomeworkFeedback       teacher review rounds — immutable, append-only
```

- **Homework binds to `(subjectId, sectionId)` — always subject-bound.** The brief
  states it plainly: *Homework belongs to TeacherAssignment ↓ Subject+Section.* There
  is no "general/daily homework" without a subject in M6 (unlike M4's DAILY sessions).
  A `(subject × section)` pair is valid iff a `TeacherAssignment` exists for it — the
  same validity rule M5 uses for registers.
- **Homework also carries `academicYearId`** (Restrict), stamped at creation from the
  ACTIVE year. Homework is year-scoped content; the year FK is what the cross-year
  submission invariant (§7) checks against — the same enforcement boundary as
  ADR-012 §10 (Subject/Section are year-agnostic, so the year must live on the
  homework row itself).
- **No register/section-fan-out entity.** M4/M5 needed a per-section register because
  one definition (a date, an assessment) spanned many sections. Homework is *already*
  authored per section — the `Homework` row **is** the register. One entity owns both
  definition and lifecycle; a second grain would be structure without a tenant.

### 2. Homework lifecycle — `DRAFT → PUBLISHED → CLOSED`, publication = parent visibility

```
enum HomeworkStatus { DRAFT  PUBLISHED  CLOSED }

DRAFT ──publish──▶ PUBLISHED ──close──▶ CLOSED
                        ▲                  │
                        └──── reopen ──────┘   (audited exception: requires a reason,
                                                stamps reopenedBy/At — ADR-012 §8 analog)
```

- **DRAFT** — teacher composing. Invisible to parents. Freely editable; attachments
  added/removed; deletable.
- **PUBLISHED** — the **parent-visibility gate** (single grain — no separate publish
  axis, per §1). Submissions are accepted **only** in this state. Definition edits are
  restricted (§3). Publish stamps `publishedAt` / `publishedByStaffId`. **Publish
  requires `dueDate` ≥ today (IST)** — publishing already-overdue homework is a
  mistake, rejected.
- **CLOSED** — submissions refused; the assignment is settled. Close stamps
  `closedAt` / `closedByStaffId`. **Review/feedback remain allowed after close**
  (teachers mark late batches after the window shuts). Close is available from
  PUBLISHED at any time — before, on, or after `dueDate`.
- **`reopen` (CLOSED → PUBLISHED)** is the one audited backward transition, mirroring
  M5's unlock: requires a **reason**, stamps `reopenedAt`/`reopenedByStaffId`/
  `reopenReason`, writes `AuditLog`. Owning teacher or admin. This handles
  "closed too early" without breaking the forward-only discipline silently.
- **No auto-close cron.** `dueDate` never mutates status by itself (M4 precedent: no
  scheduled jobs; compute-on-read). Lateness is a *snapshot on the submission* (§5);
  the hard cutoff is the explicit `close` action. This kills a whole class of
  timezone/cron failure modes and keeps a single writer for lifecycle state.
- All transitions are **guarded conditional updates** (`updateMany WHERE status =
  <from>` — loser gets `Conflict`), M4/M5 verbatim, and **audited in-transaction**.

### 3. Edit rules by state — content freezes at publish, only the deadline moves

| Field / action | DRAFT | PUBLISHED | CLOSED |
|---|---|---|---|
| title / description | ✓ | ✗ (frozen) | ✗ |
| attachments add/remove | ✓ | ✗ (frozen) | ✗ |
| `dueDate` | ✓ | **extend only** (audited; never below today or the current value) | ✗ |
| delete | ✓ (business-guarded: DRAFT only) | ✗ | ✗ |

*Why frozen:* parents act on what was published; silently editing published content
is the homework analog of mutating a published mark (ADR-012's founding sin).
Extending a deadline is additive and fair; shortening one invalidates in-flight work
— rejected. A published mistake is fixed the audited way: **reopen-style workflow is
not needed here** — close it (or let it expire) and publish a corrected assignment;
or for a wrong deadline, extend. This is deliberately stricter than "edit with
audit": M5 froze published definitions (`exam.update` blocked once published), and
consistency beats convenience.

### 4. Ownership — derived from `TeacherAssignment`, never stored (ADR-011 §3 / ADR-012 §9)

**No `ownerTeacherId` column.** "Whose homework is this" is a *live* authorization
question answered at authz time by `TeacherAssignment(teacherId, subjectId,
sectionId)` matched against `(principal.user, homework.subjectId,
homework.sectionId)` — exact subject×section match (homework is always
subject-bound, so there is no DAILY-style any-assignment looseness). Admins
(SUPER_ADMIN any / OFFICE_ADMIN school) bypass scope. Reassigning a subject moves
homework stewardship automatically — the new teacher reviews open submissions, the
old teacher loses access, and no column rots.

The rows persist **who acted**, not who is entitled — the B3 Staff-actor discipline:
`createdByStaffId` (non-null), `publishedByStaffId?`, `closedByStaffId?`,
`reopenedByStaffId?` on `Homework`; `authorStaffId` on `HomeworkFeedback`;
`reviewedByStaffId?` on `HomeworkSubmission`. All FK **`Staff`** (via the
`Staff.userId` bridge, `resolveActingStaffId` pattern), all `Restrict`.

### 5. Submission — per Enrollment, one row, race-free uniqueness

**`HomeworkSubmission.enrollmentId → Enrollment` (`Restrict`). No `studentId`
column anywhere in M6** — ADR-010 §8 applied for the fourth time. History survives
promotion by construction; a child's homework trail is per-year slices under each
enrollment.

- **Uniqueness: `@@unique([homeworkId, enrollmentId])`** — one submission row per
  child per assignment, DB-enforced, so the duplicate-submission race is a unique
  violation, not a service check (the brief's "Submission uniqueness" rule).
- **The submitting actor is a Parent:** `submittedByParentId → Parent` (`Restrict`).
  The service verifies the actor's `Parent` row (via `Parent.userId`) is linked to
  `enrollment.studentId` through `StudentParent` — the ownChild scope. Either linked
  parent may submit or resubmit; the actor column records who actually did (audit
  answers "which parent", the row answers "which child").
- A submission carries an optional **`note`** (parent's message) and ≥1 attachment;
  an empty submission (no note, no files) is rejected in the service.
- **Lateness is a snapshot, not a computation:** `isLate` is set at (re)submission
  time by comparing the IST calendar date of submission against `dueDate`
  (`@db.Date`, IST — DATABASE_CONVENTIONS §4). `firstSubmittedAt` is stamped once;
  `submittedAt` tracks the latest attempt. `isLate` reflects the **latest** attempt
  (a RETURNED→resubmit after the deadline is late work; the audit trail keeps the
  full history).

### 6. Submission lifecycle + resubmission — one row, in-place attempts, append-only history

```
enum SubmissionStatus { SUBMITTED  RETURNED  REVIEWED }

(parent submits)                    (teacher decision)
      │                                   │
      ▼          resubmit                 ▼
  SUBMITTED ◀──────────────── RETURNED (changes requested)
      │  ▲                        ▲
      │  └── resubmit while ──────┘
      ▼      pre-review
  REVIEWED  (terminal accept)
```

- **SUBMITTED** — awaiting review. The parent may still **resubmit** (fix a mistake
  before the teacher looks): attempt++, status stays SUBMITTED.
- **RETURNED** — the teacher requested changes (with a feedback row, §8). The parent
  resubmits → status back to SUBMITTED, attempt++.
- **REVIEWED** — terminal acceptance. **No resubmission after REVIEWED** — a teacher
  who wants another round sets RETURNED instead. (No backward transition; a
  mistaken REVIEWED is handled the same way a mistaken attendance mark is not: it
  isn't, in M6 — recorded as a limitation; the audited-correction analog is the
  extension point if it's ever a real need.)
- **Resubmission = in-place mutation of the same row** (attempt counter, new
  attachments, updated note/`submittedAt`/`isLate`), **never a second row** — the
  unique key forbids it, exactly like ADR-010 §5's in-place transfer. Preconditions:
  homework is **PUBLISHED** (not CLOSED), submission is SUBMITTED or RETURNED.
- **History is preserved without a version table:** `SubmissionAttachment` rows are
  **append-only and tagged with the `attempt` they belong to** — resubmission never
  deletes prior files' metadata (disputes are the product's stated reason for
  audit; "the parent did submit X on attempt 1" must stay answerable). Reads default
  to the latest attempt. `AuditLog` carries the note/status/timestamps history.
- **Review vs resubmit races** are settled by the same guarded-transition idiom:
  decisions run `WHERE status = 'SUBMITTED' AND attempt = <seen>`, resubmits run
  `WHERE status IN ('SUBMITTED','RETURNED')` — a lost race is a `Conflict`, never a
  silent overwrite of the other actor's action.

### 7. Cross-table invariants (service-enforced; DB cannot express them)

The M6 analog of ADR-012 §10 — checked in the business service on every submit/
resubmit, and tested in Step 9:

- **Section match:** `submission.enrollment.sectionId === homework.sectionId`.
- **Year match:** `submission.enrollment.academicYearId === homework.academicYearId`
  (the cross-year guarantee, enforced at the Enrollment boundary).
- **Enrollment is `ACTIVE`** at submission time (withdrawn/promoted enrollments
  cannot submit; existing rows survive — `Restrict`).
- **Parent link:** actor's Parent row is linked to `enrollment.studentId` via
  `StudentParent`.
- **Homework state:** submissions/resubmissions only while `PUBLISHED`.
- **`schoolId` consistency** across homework/enrollment/parent (loose refs, ADR-008).
- **Attachment constraints:** allowed MIME types, max size per file, max files per
  homework/submission — named constants in `packages/constants`, validated in the
  mint service *before* a signed URL exists (ADR-004).

### 8. Feedback — immutable, append-only review rounds; decision lives on the submission

`HomeworkFeedback` is the M4-correction of this module: an **append-only historical
assertion, never edited or deleted**:

```
submissionId    → HomeworkSubmission (Cascade — feedback is the submission's content)
authorStaffId   → Staff (Restrict)
attempt         Int      -- which attempt this round reviewed (snapshot)
decision        SubmissionStatus  -- RETURNED or REVIEWED (snapshot of the round's outcome)
body            String   -- text only; NO score/grade fields (grading is out of scope)
createdAt
```

- Writing a feedback row and transitioning the submission (`RETURNED`/`REVIEWED`,
  stamping `reviewedByStaffId`/`reviewedAt`) happen in **one transaction** with the
  `AuditLog` row — decision state on the submission, narrative history in feedback
  rows, machine trail in the audit (three layers, M4 discipline).
- **Feedback is parent-visible immediately** — the review decision *is* the
  publication act for feedback; a second visibility gate would be structure without
  a purpose (the homework itself is already published, or no submission could exist).
- Multiple rounds accumulate (RETURNED → resubmit → RETURNED → … → REVIEWED), each
  row pinned to the attempt it judged.

### 9. Storage — ADR-004 end-to-end, one new private bucket

Reuses the M3 `StoragePort` machinery **unchanged** (mint services in business, the
`storageProcedure` gate in api, the web service-role adapter):

- **One new private bucket: `homework-files`** (`STORAGE_BUCKETS.HOMEWORK_FILES`).
  Server-chosen, namespaced paths — a client never picks a path:
  - teacher files: `{schoolId}/homework/{homeworkId}/{uuid}-{safeName}`
  - parent files: `{schoolId}/submission/{submissionId}/{attempt}/{uuid}-{safeName}`
- **Upload URLs** minted only after the full write-authz chain: teacher/admin must
  own the (DRAFT) homework; parent must pass every §7 invariant for the submission.
  MIME/size validated at mint; DB rows store metadata (`storagePath`, `fileName`,
  `mimeType`, `sizeBytes`, optional `checksum`) — **paths, never URLs**
  (DATABASE_CONVENTIONS §4).
- **Download URLs** (300 s TTL, the M3 constant) minted only after read-authz:
  homework attachments follow homework visibility (§10); submission attachments are
  visible to admins, the owning teacher (derived), and the linked parents —
  **never to other parents**.
- Deleting metadata does not delete bytes (M3 precedent — storage cleanup is a
  deferred concern); orphaned uploads (URL minted, metadata never written) are
  accepted the same way.
- Bucket provisioning is a **user runbook step** (RUNBOOK_SUPABASE_SETUP §3-style,
  service-role only; live provisioning stays with the user).

### 10. Visibility model (business-authoritative; RLS defense-in-depth)

| Role | Homework | Submissions | Feedback |
|---|---|---|---|
| SUPER_ADMIN / OFFICE_ADMIN | all (school) | all (school) | all |
| TEACHER | own `(subject × section)` via TeacherAssignment — **all states** | own subject×section | own subject×section |
| PARENT | **PUBLISHED/CLOSED only**, for a section where an **own child** has an eligible enrollment, **or any homework their child has a submission for** | own children's only | own children's only |
| ACCOUNTANT / anon | none | none | none |

The bolded parent clause resolves the **mid-year transfer** edge (ADR-010 §5):
`Enrollment.sectionId` mutates in place, so after a 5-A → 5-B move the child's old
5-A homework would vanish from a pure section-match read — but their submission and
feedback must remain reachable. Parent visibility is therefore *section-match* **or**
*has-a-submission* (CLOSED homework stays visible — parents read feedback after
close). New submissions still require the §7 section match, so the transferred child
can *see* but not *submit into* the old section's homework.

### 11. Permissions (extends PERMISSIONS_MATRIX; constants land in Step 5)

| Permission | SA | OA | T | P | AC |
|---|---|---|---|---|---|
| `homework:manage` (create/edit/publish/close/reopen/delete + attachments) | any | school | ownSubject×Section | – | – |
| `homework:read` | any | school | ownSubject×Section | ownChild (published; §10) | – |
| `submission:submit` (create/resubmit + attachments) | – | – | – | ownChild | – |
| `submission:review` (return/accept + feedback) | any | school | ownSubject×Section | – | – |
| `submission:read` | any | school | ownSubject×Section | ownChild (own submissions) | – |

Deviations from the PRD-planned matrix rows, decided here:

- **OFFICE_ADMIN gets `homework:manage` (school)** — the planned matrix gave OA no
  `homework:create`, but the M6 brief's RLS spec says **"Admin ALL"**, and every
  shipped milestone (M2–M5) grants OA full school-wide management. Brief +
  consistency win.
- **`submission:submit` is parent-only** — admins do not fabricate a child's
  submission on anyone's behalf (an offline/paper submission is recorded by the
  teacher as a REVIEWED decision with a feedback note only if ever needed — not
  modelled in M6; documented edge case).
- Planned rows said `ownDivision (+ownSubject when subject-bound)` for teachers;
  since M6 homework is **always** subject-bound (§1), the teacher scope is uniformly
  `ownSubject×Section` — no division-only variant exists.

### 12. Delete rules and the published-data guard (R5 analog)

- `Homework → HomeworkAttachment / HomeworkSubmission` : **Cascade**;
  `HomeworkSubmission → SubmissionAttachment / HomeworkFeedback` : **Cascade**
  (compositions — children have no independent meaning).
- `→ Enrollment`, `→ Parent`, `→ Staff` actors, `→ Subject/Section/AcademicYear` :
  **Restrict** (data-bearing references; a parent/enrollment with submission history
  is never hard-deletable).
- **Business guard (canonical, single function — M5 `assertExamDeletable` idiom):**
  `deleteHomework` refuses unless `status = DRAFT`. Since submissions require
  PUBLISHED, a DRAFT homework structurally has none — the Cascade chain can only
  ever wipe teacher-side draft content. Published/closed homework is never
  deletable (close it instead); direct SQL remains the accepted, admin-only bypass
  (same posture as R5).

### 13. RLS (Step 4, separate `*_rls` migration — defense-in-depth per ADR-002)

Per the brief: **admin ALL** on all five tables; **teacher** SELECT/write on own
homework + own-section submissions/feedback via `TeacherAssignment` SECURITY-DEFINER
helpers (M5 idiom); **parent** SELECT published homework for own child's section (or
own-child submission), own-child submissions/attachments/feedback, INSERT/UPDATE
scoped to own-child submissions; **anon none**; service_role bypasses (Prisma path —
authoritative checks stay in the business layer). Storage policies on
`homework-files` mirror the same reach. READ + WRITE isolation proven empirically on
local Postgres with stubbed `auth.uid()` (M5's 12/12 + 15/15 method).

## Alternatives Considered

- **Distribution-only homework (the PRD v1.3 / decision-#13 shape)** — rejected: the
  M6 brief explicitly scopes submissions, parent uploads, review, and feedback as
  core. The brief is the current product decision; the PRD docs are corrected in
  Step 10 (precedent: M5 publish-notify).
- **Feature-flag the submission flow (`homework-uploads`, ADR-006)** — rejected: the
  add-on plan belonged to the distribution-only decision the brief reversed. Core
  scope ⇒ no flag; resurrectable later as a *commercial* toggle without schema change
  (the flag would gate routers/UI, not tables).
- **A per-section register entity between Homework and Submission** — rejected
  (structure without a tenant): homework is authored per section already; the
  Homework row is the register (§1).
- **Submission rows per attempt (`unique(homework, enrollment, attempt)`)** —
  rejected: feedback/decision state would smear across rows and "the child's current
  submission" becomes a max-attempt query everywhere. One row + append-only
  attachments/feedback preserves the same history at lower cost (ADR-012 §11 keeps
  the attempt-discriminator idiom as the recorded extension point).
- **`ownerTeacherId` on Homework** — rejected for the third time (ADR-011 B, ADR-012
  §9): duplicates `TeacherAssignment` truth and rots on reassignment.
- **Auto-close homework at `dueDate` (cron)** — rejected: no scheduled jobs in the
  codebase yet; a cron cliff at midnight IST is a support burden; lateness-as-
  snapshot + explicit close covers the need (§2).
- **Score/grade fields on feedback** — rejected: grading is explicitly out of scope;
  a nullable score column now would be unpriced grading debt. If grading arrives, it
  gets its own decision (likely linking toward the exam/grade machinery).
- **Attaching submissions to Student** — forbidden outright (brief + ADR-010): breaks
  promotion-proof history and every downstream aggregation convention.

## Consequences

- (+) Every load-bearing pattern is a reuse, not an invention: Enrollment join
  (ADR-010), derived ownership + Staff actors + guarded transitions (ADR-011/012),
  publication gate + audited reopen (ADR-012), StoragePort + private bucket + mint-
  after-authz (ADR-004/M3), audit-in-tx (ADR-007).
- (+) Duplicate submission is **structurally impossible** (DB unique), review/resubmit
  races surface as `Conflict`, and history (attempts, feedback rounds, transitions)
  is reconstructable from append-only rows + AuditLog.
- (+) Parent visibility survives mid-year transfer without a membership-history table
  (§10's or-clause), and promotion never re-points a submission.
- (−) **Two divergences from written docs** are absorbed deliberately: the PRD's
  distribution-only decision (brief overrides; docs corrected Step 10) and the
  planned matrix's OA-cannot-create row (brief's "Admin ALL" + M2–M5 consistency).
- (−) `SubmissionAttachment` append-only history costs storage (old attempts keep
  their files); accepted for dispute-answerability — a lifecycle/cleanup policy is a
  future ops concern, same bucket-hygiene posture as M3.
- (−) No resubmission after REVIEWED and no un-review transition — a mistaken
  terminal accept has no in-module correction path in M6 (extension point: an
  audited correction analog of M4 if it becomes a real need).
- (−) Ownership derivation means a subject with **no current TeacherAssignment** has
  no teacher who can review (admins still can) — same accepted gap as M4/M5.

## Risk register (Step 1)

- **R1 — Cross-year/section integrity is service-enforced** (§7): Subject/Section
  are year-agnostic (frozen M2), so year- and section-match live in the service, not
  FKs. Mitigation: explicit invariants + Step-9 tests (wrong-section, wrong-year,
  inactive-enrollment submissions → reject).
- **R2 — Review/resubmit concurrency:** decision and resubmission mutate the same
  row from two roles. Mitigation: guarded conditional updates keyed on
  `(status, attempt)`; Step-9 `Promise.all` race tests (M4 method).
- **R3 — Parent visibility or-clause (§10) is the subtlest read rule** (section-match
  OR has-submission; published-only; CLOSED still readable). A bug here either leaks
  another section's homework or strands a transferred child's feedback. Mitigation:
  dedicated read-scope tests, both business and RLS layers.
- **R4 — Storage authorization surface doubles** (teacher files + parent files, two
  path namespaces, upload + download each). Mitigation: single mint service per
  direction with the full authz chain before URL issuance (M3 idiom), tested per
  role in Step 9.
- **R5 — Cascade under a published row** (ADR-012 R5 analog): the guard is
  business-layer only (`DRAFT`-only delete); direct SQL bypasses it — accepted,
  admin-only, consistent posture.
- **R6 — B3 provisioning invariant extends to M6:** every teacher/admin acting on
  homework needs a `Staff` row; every submitting parent needs a `Parent` row with
  `userId`. Existing provisioning covers both; Step-9 asserts the failure mode is a
  clean domain error, not a 500.
