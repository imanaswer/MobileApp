# Database Relationship Diagram — School Management Portal

Visual companion to Dev PRD §6 (the schema there is the source of truth). Mermaid ER diagram of the **full target schema** (all milestones + add-ons). Milestone tags show when each model's migration lands (numbering per REVIEW_FINDINGS A1 — code numbering: M1 auth, M2 people, …).

## Legend

- `||--o{` one-to-many · `||--||` one-to-one · `}o--o{` many-to-many (via join model)
- **Loose refs** (deliberately no FK): `schoolId` everywhere (ADR-008), `AuditLog`/`ImportJob` actor+entity (ADR-007), `Announcement.targetId` (polymorphic). Shown as dashed notes, not edges.
- Partial unique indexes (raw SQL in migrations): `ReportCard(enrollmentId, examId) WHERE examId IS NOT NULL` (ADR-009), `GuardianStudent(studentId) WHERE isPrimary`, and (proposed, REVIEW_FINDINGS B6) `AcademicYear(schoolId) WHERE isCurrent`.

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
    STAFF { string userId FK,UK "" }
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

    ACADEMIC_YEAR { bool isCurrent "exactly one (B6 partial idx)" }
    DIVISION { string name "UK(classLevelId, name)" }
    CLASS_SUBJECT { string id "UK(classLevelId, subjectId, academicYearId)" }
    TEACHER_ASSIGNMENT { bool isClassTeacher "grants division rights" }
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
        date date "IST calendar date (@db.Date — B9)"
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
    ENROLLMENT ||--o{ REPORT_CARD : ""
    EXAM ||--o{ REPORT_CARD : "OPTIONAL (ADR-009)"

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
        string examId "nullable — partial UK WHERE NOT NULL"
        string pdfUrl "storage PATH, signed on read (B7)"
    }
```

## Communication & notifications (M5)

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
    HOMEWORK { string attachmentUrls "storage paths (B7)" }
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
    TIMETABLE_PERIOD { string id "UK(divisionId, dayOfWeek, periodNo)" }
```

Standalone (loose refs only): `SCHOOL` (tenant root), `AUDIT_LOG(actorUserId, entityType, entityId, before/afterJson)`, `IMPORT_JOB`, `FEATURE_FLAG(UK schoolId+key)`.

**Proposed addition (B1):** `HOLIDAY(schoolId, date, name, scope?)` + working-weekday config in typed `SchoolSettings` — required by leave approval and the absence job.

## onDelete policy summary (DATABASE_CONVENTIONS §7)

| Cascade (composition) | Restrict (history/money) |
|---|---|
| Staff/Guardian→User, GuardianStudent, DeviceToken, Notification, GradeBand→Scale, ExamSubject→Exam, Message→Thread, FeeItem→Structure, InvoiceLine→Invoice | Mark, Attendance, Enrollment, Invoice, Payment, ReportCard, LeaveApplication, all academic structure |
