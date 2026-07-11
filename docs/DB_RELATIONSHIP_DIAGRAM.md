# Database Relationship Diagram — School Management Portal

Visual companion to Dev PRD §6 (the schema there is the source of truth). Mermaid ER diagram of the **full target schema** (all milestones + add-ons). Milestone tags show when each model's migration lands (numbering per REVIEW_FINDINGS A1 — code numbering: M1 auth, M2 people, …).

## Legend

- `||--o{` one-to-many · `||--||` one-to-one · `}o--o{` many-to-many (via join model)
- **Loose refs** (deliberately no FK): `schoolId` everywhere (ADR-008), `AuditLog`/`ImportJob` actor+entity (ADR-007), `Announcement.targetId` (polymorphic). Shown as dashed notes, not edges.
- Partial unique indexes (raw SQL in migrations): **M7** `ReportCard` per kind — ONE PUBLISHED per `(enrollment, scope)` + `(enrollment, scope, version)` unique (ADR-014, generalizes ADR-009's `examId`-nullable seam); `GuardianStudent(studentId) WHERE isPrimary`; `AcademicYear(schoolId) WHERE isCurrent` (adopted v1.3 — exactly one current year).

## Identity & people (M1–M2)

```mermaid
erDiagram
    USER ||--o| STAFF : "profile (1:1, cascade)"
    USER ||--o| GUARDIAN : "profile (1:1, cascade)"
    USER ||--o{ DEVICE_TOKEN : "cascade"
    USER ||--o{ NOTIFICATION : "cascade"
    GUARDIAN ||--o{ GUARDIAN_STUDENT : "cascade"
    STUDENT ||--o{ GUARDIAN_STUDENT : "cascade"

    USER {
        string id PK "== Supabase auth UID"
        string schoolId "loose"
        enum role "SUPER_ADMIN|OFFICE_ADMIN|TEACHER|PARENT|ACCOUNTANT"
        string phone UK "nullable"
        string email UK "nullable"
        enum status "INVITED|ACTIVE|DISABLED"
        enum locale "EN|ML"
    }
    STAFF { string name "display name — one field (M8, ADR-016)" }
    GUARDIAN { string userId FK,UK "" }
    STUDENT { string admissionNo UK "" }
    GUARDIAN_STUDENT {
        string guardianId PK,FK ""
        string studentId PK,FK ""
        bool isPrimary "partial-unique per student"
    }
```

## Academic structure & enrollment (M2)

```mermaid
erDiagram
    ACADEMIC_YEAR ||--o{ CLASS_SUBJECT : ""
    ACADEMIC_YEAR ||--o{ ENROLLMENT : ""
    ACADEMIC_YEAR ||--o{ EXAM : ""
    CLASS_LEVEL ||--o{ DIVISION : ""
    CLASS_LEVEL ||--o{ CLASS_SUBJECT : ""
    CLASS_LEVEL ||--o{ ENROLLMENT : ""
    SUBJECT ||--o{ CLASS_SUBJECT : ""
    DIVISION ||--o{ TEACHER_ASSIGNMENT : ""
    DIVISION ||--o{ ENROLLMENT : ""
    CLASS_SUBJECT ||--o{ TEACHER_ASSIGNMENT : "optional"
    STAFF ||--o{ TEACHER_ASSIGNMENT : "cascade"
    STUDENT ||--o{ ENROLLMENT : ""

    ACADEMIC_YEAR { bool isCurrent "exactly one — partial unique idx (v1.3)" }
    HOLIDAY {
        date date "school calendar (v1.3, Dev PRD 8.19)"
        string classLevelId "nullable scope"
        string id "UK(schoolId, date, classLevelId)"
    }
    DIVISION { string name "UK(classLevelId, name)" }
    CLASS_SUBJECT { string id "UK(classLevelId, subjectId, academicYearId)" }
    TEACHER_ASSIGNMENT { string note "NO isClassTeacher flag — class teacher is the dedicated ClassTeacherAssignment (M6.5, ADR-015)" }
    ENROLLMENT {
        enum status "ADMITTED..ALUMNI lifecycle"
        string id "UK(studentId, academicYearId)"
    }
```

## Attendance & leave (M3 attendance, M5 leave)

```mermaid
erDiagram
    ENROLLMENT ||--o{ ATTENDANCE : ""
    STAFF ||--o{ ATTENDANCE : "markedBy"
    STUDENT ||--o{ LEAVE_APPLICATION : "year-independent"
    USER ||--o{ LEAVE_APPLICATION : "appliedBy"
    STAFF ||--o{ LEAVE_APPLICATION : "decidedBy (nullable)"

    ATTENDANCE {
        date date "IST calendar date — @db.Date (decided v1.3)"
        int period "0 = whole day; 1..N period-wise"
        enum status "PRESENT|ABSENT|HALF_DAY|LEAVE|HOLIDAY"
        string id "UK(enrollmentId, date, period)"
    }
    LEAVE_APPLICATION {
        enum status "PENDING|APPROVED|REJECTED|CANCELLED"
        date fromDate ""
        date toDate ""
    }
```

Leave→Attendance bridge (no FK): on APPROVED, service resolves `studentId → current ACTIVE Enrollment` and upserts `Attendance(LEAVE)` per school day (§8.7; school-day source = calendar model, REVIEW_FINDINGS B1).

## Exams, marks, report cards (M4)

> **Report cards IMPLEMENTED in M7** (`20260710030000_report_card_management`, ADR-014) —
> the `REPORT_CARD` block below reflects the shipped model, superseding the ADR-009
> `examId`-only sketch. It is a LEAF reporting table (no children): **9 FKs, ALL Restrict,
> no Cascade/SetNull in or out**. Delete rules + rollback-safety **live-verified** M7 Step 3
> (matrix 9/9 exact; D1–D5 delete-blocked incl. year-cascade precision; P1–P3 cards survive
> promotion/transfer/withdrawal by construction — key to the immutable enrollment; 0 rows
> persisted). Owner = Enrollment (ADR-010 §8); Exam/Term/Year are scope, not owners.

```mermaid
erDiagram
    ACADEMIC_YEAR ||--o{ EXAM : ""
    EXAM ||--o{ EXAM_SUBJECT : "cascade"
    CLASS_SUBJECT ||--o{ EXAM_SUBJECT : ""
    EXAM_SUBJECT ||--o{ MARK : ""
    ENROLLMENT ||--o{ MARK : ""
    STAFF ||--o{ MARK : "enteredBy"
    GRADE_SCALE ||--o{ GRADE_BAND : "cascade"
    GRADE_BAND ||--o{ MARK : "optional"
    ENROLLMENT ||--o{ REPORT_CARD : "restrict — OWNER; never orphaned, survives promotion/withdrawal/transfer"
    EXAM ||--o{ REPORT_CARD : "restrict — EXAM-card scope (nullable, ADR-009)"
    ACADEMIC_TERM ||--o{ REPORT_CARD : "restrict — TERM-card scope (nullable)"
    STAFF ||--o{ REPORT_CARD : "createdBy / submittedBy? / approvedBy? / publishedBy? / reopenedBy? / revokedBy? — all restrict (audit actors, B3)"

    EXAM_SUBJECT { string id "UK(examId, classSubjectId)" }
    MARK {
        float theory "nullable"
        float practical "nullable"
        bool isAbsent ""
        string id "UK(examSubjectId, enrollmentId)"
        datetime updatedAt "conflict detection"
    }
    GRADE_BAND { string grade "A+..E configurable" }
    REPORT_CARD {
        enum kind "EXAM|TERM|ANNUAL — discriminator (ADR-009 seam); kind⟺scope CHECK"
        string examId "nullable — EXAM cards only"
        string termId "nullable — TERM cards only"
        int version "R3: bumps per correction; (scope,version) unique per kind"
        enum status "DRAFT|SUBMITTED|APPROVED|PUBLISHED|SUPERSEDED|REVOKED — approve=snapshot frozen, publish=parent gate"
        int rank "snapshot @approve + rankScope(SECTION|CLASS) + cohortSize (R2)"
        float attendancePercentage "snapshot @approve — compute-on-read (ADR-011)"
        float gpaSnapshot "display copy — marks already immutable upstream (ADR-012)"
        string pdfPath "private bucket PATH, signed on read; NOT lifecycle-gating (R5)"
        string id "partial-unique per kind: ONE PUBLISHED per scope + (scope,version) unique"
    }
```

## Homework & submissions (M6 — IMPLEMENTED per ADR-013)

> This section reflects the **implemented** schema (`20260710000000_homework_management`),
> which supersedes the Dev PRD §8.6 distribution-only sketch below (the `HOMEWORK`
> entity under "Communication & notifications" — `DIVISION`-era vocabulary, no
> submissions). The M6 brief made parent submissions **core**; ADR-013 is the source
> of truth. Delete rules **live-verified** M6 Step 3 (rollback-safe probes R1–R10:
> 17/17 FK rules exact, promotion/transfer history preservation, cascade precision,
> durable actors, guarded-transition primitives, zero probe rows persisted).

```mermaid
erDiagram
    ACADEMIC_YEAR ||--o{ HOMEWORK : "restrict — year stamped at creation (cross-year boundary)"
    SUBJECT ||--o{ HOMEWORK : "restrict — always subject-bound"
    SECTION ||--o{ HOMEWORK : "restrict"
    STAFF ||--o{ HOMEWORK : "createdBy / publishedBy? / closedBy? / reopenedBy? — all restrict (audit actors, not owners)"
    HOMEWORK ||--o{ HOMEWORK_ATTACHMENT : "CASCADE (teacher files = content)"
    STAFF ||--o{ HOMEWORK_ATTACHMENT : "uploadedBy restrict"
    HOMEWORK ||--o{ HOMEWORK_SUBMISSION : "CASCADE (delete business-guarded to DRAFT — structurally submission-free)"
    ENROLLMENT ||--o{ HOMEWORK_SUBMISSION : "restrict — NEVER Student (ADR-010 §8)"
    PARENT ||--o{ HOMEWORK_SUBMISSION : "submittedBy restrict — parents submit, no student login"
    STAFF ||--o{ HOMEWORK_SUBMISSION : "reviewedBy? restrict"
    HOMEWORK_SUBMISSION ||--o{ SUBMISSION_ATTACHMENT : "CASCADE (append-only, attempt-tagged)"
    PARENT ||--o{ SUBMISSION_ATTACHMENT : "uploadedBy restrict"
    HOMEWORK_SUBMISSION ||--o{ HOMEWORK_FEEDBACK : "CASCADE (immutable review rounds)"
    STAFF ||--o{ HOMEWORK_FEEDBACK : "author restrict"

    HOMEWORK {
        date dueDate "IST @db.Date; extend-only once PUBLISHED (service)"
        enum status "DRAFT|PUBLISHED|CLOSED — CHECK: DRAFT iff no publish stamp, CLOSED iff close stamp (reopen clears it)"
        string reopenReason "audited reopen = the one backward transition (M5 unlock analog)"
        string id "no natural key — duplicate titles legal (deliberate)"
    }
    HOMEWORK_ATTACHMENT { string storagePath "PRIVATE homework-files path, signed on read (ADR-004)" }
    HOMEWORK_SUBMISSION {
        enum status "SUBMITTED|RETURNED|REVIEWED — CHECK: decision states carry reviewedBy/At"
        int attempt "CHECK >= 1; resubmit = in-place attempt++ on the SAME row"
        bool isLate "snapshot at latest (re)submit vs dueDate — no cron"
        string id "UK(homeworkId, enrollmentId) — duplicate race is a DB error; holds across transfer (R3)"
    }
    SUBMISSION_ATTACHMENT { int attempt "CHECK >= 1 — history never deleted on resubmit" }
    HOMEWORK_FEEDBACK {
        enum decision "RETURNED|REVIEWED only — CHECK <> SUBMITTED"
        int attempt "which attempt this round judged (snapshot)"
        string body "text only — NO score/grade (grading out of scope)"
    }
```

Cross-table invariants **not** in the DB (service layer, ADR-013 §7): section match,
year match, ACTIVE enrollment, StudentParent link, PUBLISHED-only submission.
Ownership derives from `TeacherAssignment(teacher, subject, section)` at authz time —
no owner column to rot.

## Timetable (M9 — IMPLEMENTED per ADR-017)

> This section reflects the **implemented** schema (`20260711010000_timetable_management`,
> ADR-017), which supersedes the Dev PRD `TIMETABLE_PERIOD` sketch under "Ops, flags,
> add-ons" below (`DIVISION`-era vocabulary, optional-FK distribution model). Grain:
> **BellSchedule** (the year's day structure — **exactly one per year**, `UK(schoolId,
> academicYearId)`) → **Period** (numbered clock-time slots) → **TimetableEntry** (one
> weekly slot). Delete rules **live-verified** M9 Step 3 (rollback probes, 0 rows
> persisted): every parent referenced by a timetable row is **Restrict**-blocked; the
> derived-ownership edge to `TeacherAssignment` is deliberately **not** a FK.

```mermaid
erDiagram
    ACADEMIC_YEAR ||--o| BELL_SCHEDULE : "restrict — EXACTLY ONE per year (UK schoolId+academicYearId)"
    BELL_SCHEDULE ||--o{ PERIOD : "restrict — NO cascade (brief); empty schedule before delete"
    ACADEMIC_YEAR ||--o{ TIMETABLE_ENTRY : "restrict — denormalized read path"
    SECTION ||--o{ TIMETABLE_ENTRY : "restrict"
    SUBJECT ||--o{ TIMETABLE_ENTRY : "restrict"
    USER ||--o{ TIMETABLE_ENTRY : "teacher restrict — teacherId=auth.uid() (RLS)"
    PERIOD ||--o{ TIMETABLE_ENTRY : "restrict"

    BELL_SCHEDULE { string id "UK(schoolId, academicYearId) — one per year (ADR-017 §1)" }
    PERIOD {
        int order "1-based; CHECK order > 0; UK(bellScheduleId, order)"
        time startTime "clock time @db.Time; CHECK startTime < endTime"
        time endTime ""
        bool isBreak "break periods hold NO class (business rejects an entry on one)"
    }
    TIMETABLE_ENTRY {
        enum weekday "MON..SUN"
        string teacherId "→ User (derived ownership via TeacherAssignment — NOT a FK)"
        string room "nullable"
        string id "UK(sectionId, weekday, periodId) + UK(teacherId, weekday, periodId) — double-booking impossible"
    }
```

Delete-rule probes (M9 Step 3, all in one rolled-back tx):

| Delete target | Result | Referenced by |
|---|---|---|
| `AcademicYear` | **BLOCKED** (Restrict) | BellSchedule + TimetableEntry |
| `Section` | **BLOCKED** (Restrict) | TimetableEntry (+ TeacherAssignment) |
| `Subject` | **BLOCKED** (Restrict) | TimetableEntry (+ TeacherAssignment) |
| `Period` | **BLOCKED** (Restrict) | TimetableEntry |
| `BellSchedule` | **BLOCKED** (Restrict) | Period (no cascade) |
| `User` (teacher) | **BLOCKED** (Restrict) | TimetableEntry (+ TeacherAssignment) |
| `TeacherAssignment` | **ALLOWED** | *nothing* — ownership is derived, not FK'd |

**Derived-ownership caveat (Step-5 business guard):** because there is **no FK** from
`TimetableEntry` to `TeacherAssignment`, the DB will **not** block deleting a
`TeacherAssignment` that leaves timetable rows whose `(teacher, subject, section)` triple
no longer has a backing assignment. Keeping timetable ownership valid on assignment
removal is a **business-layer** responsibility (`TimetableService`) — the same posture
as attendance/exam/homework, where ownership is resolved at authz time, not stored.

## Notifications (M10 — IMPLEMENTED per ADR-018)

> The implemented **in-app** notification schema (`20260711030000_notification_management`, ADR-018) —
> supersedes the `USER ||--o{ NOTIFICATION : "cascade"` sketch in the Identity section (which pre-dated the
> per-user recipient split and used cascade). Grain: **Notification** (one immutable event) → 1:N
> **NotificationRecipient** (one per-user copy — read/archive state). Both FKs **Restrict** (not cascade —
> brief). Recipients are resolved once at emit and stored explicitly. Isolation **live-verified** M10 Step 3
> (rolled back): a user reads/writes only own recipient rows (Teacher A ≠ Teacher B, parent ≠ other parent);
> a Notification is readable iff an EXISTS recipient row; admin all; anon none.

```mermaid
erDiagram
    USER ||--o{ NOTIFICATION_RECIPIENT : "restrict — one copy per user per event"
    NOTIFICATION ||--o{ NOTIFICATION_RECIPIENT : "restrict — fan-out"

    NOTIFICATION {
        enum type "HOMEWORK_PUBLISHED|EXAM_PUBLISHED|REPORT_CARD_PUBLISHED|ANNOUNCEMENT|TIMETABLE_UPDATED?|STUDY_MATERIAL?|SYSTEM"
        enum priority "LOW|NORMAL|HIGH|URGENT"
        string actionUrl "deep link (nullable)"
        datetime createdAt "immutable — NO updatedAt"
        string schoolId "loose (ADR-008)"
    }
    NOTIFICATION_RECIPIENT {
        bool isRead "readAt when true"
        bool isArchived "archivedAt — reversible SOFT DELETE"
        string id "UK(notificationId, userId) — idempotency floor"
    }
```

Generated **after commit** by a business `*AndNotify` composition wrapping the frozen publish services
(Homework/Exam/ReportCard) — services untouched; delete() hard-removes the caller's own recipient row (the
shared event + other recipients survive). `TIMETABLE_UPDATED`/`STUDY_MATERIAL` types reserved (no M10 source).

**M10 note:** notifications use **no Cascade, no SetNull** — both FKs Restrict (`NotificationRecipient →
Notification`, `NotificationRecipient → User`). Purely additive (2 tables + 2 enums); the `User.notifications`
back-relation is virtual. `migrate diff` (M9 head → schema) = only these CREATEs, zero ALTER; zero drift.

## Communication & notifications (messages — NOT built; announcements now via M10)

> The `HOMEWORK` entity in this sketch is **superseded by the implemented M6 model
> above** (distribution-only → full submissions; brief overrides Dev PRD decision #13).
> The `ANNOUNCEMENT` entity is **superseded by M10** — an announcement is a
> `Notification(type=ANNOUNCEMENT)` (see the Notifications section above), no separate
> table. **Messages/threads** remain future work.

```mermaid
erDiagram
    STAFF ||--o{ MESSAGE_THREAD : ""
    GUARDIAN ||--o{ MESSAGE_THREAD : ""
    STUDENT ||--o{ MESSAGE_THREAD : "optional context"
    MESSAGE_THREAD ||--o{ MESSAGE : "cascade"
    USER ||--o{ MESSAGE : "sender"
    USER ||--o{ ANNOUNCEMENT : "createdBy"
    DIVISION ||--o{ HOMEWORK : ""
    CLASS_SUBJECT ||--o{ HOMEWORK : "optional"
    STAFF ||--o{ HOMEWORK : "createdBy"

    MESSAGE_THREAD { string id "strictly 1:1 staff-guardian (B12)" }
    MESSAGE { datetime readAt "single recipient" }
    ANNOUNCEMENT {
        enum scope "SCHOOL|CLASS|DIVISION"
        string targetId "LOOSE polymorphic: ClassLevel or Division id"
    }
    HOMEWORK { string attachmentUrls "storage paths (B7) — SUPERSEDED by M6 section above" }
```

## Ops, flags, add-ons (M1 audit/flags; add-ons behind flags)

```mermaid
erDiagram
    FEE_STRUCTURE ||--o{ FEE_ITEM : "cascade"
    FEE_STRUCTURE ||--o{ INVOICE : ""
    ACADEMIC_YEAR ||--o{ FEE_STRUCTURE : ""
    CLASS_LEVEL ||--o{ FEE_STRUCTURE : "optional"
    STUDENT ||--o{ INVOICE : ""
    INVOICE ||--o{ INVOICE_LINE : "cascade"
    FEE_ITEM ||--o{ INVOICE_LINE : ""
    INVOICE ||--o{ PAYMENT : ""
    DIVISION ||--o{ TIMETABLE_PERIOD : ""
    CLASS_SUBJECT ||--o{ TIMETABLE_PERIOD : "optional"
    STAFF ||--o{ TIMETABLE_PERIOD : "optional"

    INVOICE { enum status "PENDING|PARTIAL|PAID|OVERDUE|CANCELLED" }
    PAYMENT {
        enum status "CREATED|CAPTURED|FAILED|REFUNDED"
        string razorpayOrderId "indexed for webhook"
        int amount "paise"
    }
    TIMETABLE_PERIOD { string id "SUPERSEDED by the M9 Timetable section above (BellSchedule/Period/TimetableEntry, ADR-017)" }
```

Standalone (loose refs only): `SCHOOL` (tenant root), `AUDIT_LOG(actorUserId, entityType, entityId, before/afterJson)`, `IMPORT_JOB`, `FEATURE_FLAG(UK schoolId+key)`.

**Adopted v1.3:** `Holiday(schoolId, date, name, classLevelId?)` + working-weekday config in typed `SchoolSettings` (Dev PRD §8.19) — the school-day source of truth for leave approval and the absence job. Storage fields are now `*Path` (`logoPath`, `photoPath`, `pdfPath`, `attachmentPaths`, `filePath`) per decision #24.

## onDelete policy summary (DATABASE_CONVENTIONS §7)

| Cascade (composition) | Restrict (history/money) |
|---|---|
| Staff/Guardian→User, GuardianStudent, DeviceToken, Notification, GradeBand→Scale, ExamSubject→Exam, Message→Thread, FeeItem→Structure, InvoiceLine→Invoice, **M6:** HomeworkAttachment→Homework, HomeworkSubmission→Homework (delete business-guarded to DRAFT), SubmissionAttachment→Submission, HomeworkFeedback→Submission | Mark, Attendance, Enrollment, Invoice, Payment, ReportCard, LeaveApplication, all academic structure, **M6:** Submission→Enrollment/Parent, every homework Staff/Parent actor, Homework→Year/Subject/Section, **M7:** ReportCard→Enrollment/Exam/Term + all 6 Staff actors |

**M6 note:** the homework tables use **no SetNull** — verified live (R1: 17/17 FK
delete rules exact; only Cascade content edges + Restrict data/actor edges).

**M7 note:** `ReportCard` is a **leaf** — **9 FKs, all Restrict, no Cascade/SetNull** in or
out. Verified live (Step 3): matrix 9/9 exact; a published card can never be orphaned or
cascade-deleted, and survives promotion/withdrawal/transfer because it keys to the immutable
enrollment (ADR-014 §8). Cascade precision: deleting the `AcademicYear` is blocked upstream at
`Enrollment→AcademicYear` (Restrict), so no cascade can reach a term a card scopes.

**M9 note:** timetable uses **no Cascade, no SetNull** — all 7 FKs Restrict
(BellSchedule→Year; Period→BellSchedule; TimetableEntry→Year/Section/Subject/User/Period).
Verified live (Step 3): 6/6 referenced parents delete-blocked, 0 rows persisted. A
`Period` CHECK enforces `startTime < endTime AND order > 0`; two uniques on
`TimetableEntry` make section/teacher double-booking structurally impossible. Ownership
is **derived** from `TeacherAssignment` (no FK) — assignment-removal integrity is a
business guard, not a DB rule.

**M10 note:** notifications use **no Cascade, no SetNull** — both FKs Restrict
(`NotificationRecipient → Notification`, `NotificationRecipient → User`). Verified live
(Step 3): recipient owner reads/writes only own rows; a `Notification` is readable iff an
EXISTS recipient row; isolation proven (Teacher A ≠ Teacher B, parent ≠ other parent).
`@@unique(notificationId, userId)` is the one-copy-per-user idempotency floor; `delete()`
hard-removes the caller's own recipient row (leaf), archive = reversible soft delete.

**M11 note (ADR-019):** three additive tables, **all FKs Restrict** (no Cascade —
brief). `Announcement → AcademicYear` + `→ Staff` (createdBy); `AnnouncementAttachment
→ Announcement` + `→ Staff` (uploadedBy) — no `schoolId` on the attachment (tenant via
parent). `SchoolCalendarEvent → AcademicYear` + `→ Staff` (createdBy). `schoolId` loose
(ADR-008); `Announcement.targetId` is a **loose polymorphic** Class/Section ref (no FK —
DATABASE_CONVENTIONS §2 line 18). Back-relations added to frozen `AcademicYear`/`Staff`
are virtual (no SQL column) → `migrate diff` is zero-ALTER. CHECKs: Announcement
`publishedAt NOT NULL ⟺ status IN (PUBLISHED,ARCHIVED)`; SchoolCalendarEvent `endDate ≥
startDate`. RLS is **coarse** (admin ALL / authenticated published-or-read / anon none) —
a DRAFT delete removes attachments then the row in one service tx (Restrict); per-user
announcement targeting is a business-layer filter, not a DB rule.
