# Database Relationship Diagram — School Management Portal

Visual companion to Dev PRD §6 (the schema there is the source of truth). Mermaid ER diagram of the **full target schema** (all milestones + add-ons). Milestone tags show when each model's migration lands (numbering per REVIEW_FINDINGS A1 — code numbering: M1 auth, M2 people, …).

## Legend

- `||--o{` one-to-many · `||--||` one-to-one · `}o--o{` many-to-many (via join model)
- **Loose refs** (deliberately no FK): `schoolId` everywhere (ADR-008), `AuditLog`/`ImportJob` actor+entity (ADR-007), `Announcement.targetId` (polymorphic). Shown as dashed notes, not edges.
- Partial unique indexes (raw SQL in migrations): `ReportCard(enrollmentId, examId) WHERE examId IS NOT NULL` (ADR-009), `GuardianStudent(studentId) WHERE isPrimary`, and `AcademicYear(schoolId) WHERE isCurrent` (adopted v1.3 — exactly one current year).

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

    ACADEMIC_YEAR { bool isCurrent "exactly one — partial unique idx (v1.3)" }
    HOLIDAY {
        date date "school calendar (v1.3, Dev PRD 8.19)"
        string classLevelId "nullable scope"
        string id "UK(schoolId, date, classLevelId)"
    }
    DIVISION { string name "UK(classLevelId, name)" }
    CLASS_SUBJECT { string id "UK(classLevelId, subjectId, academicYearId)" }
    TEACHER_ASSIGNMENT { bool isClassTeacher "grants division rights" }
    ENROLLMENT {
        enum status "ADMITTED..ALUMNI lifecycle"
        string id "UK(studentId, academicYearId)"
    }
```

## Attendance, leave, corrections, holidays (M4 — SHIPPED; ADR-011 supersedes the PRD §8.4 flat model)

```mermaid
erDiagram
    ACADEMIC_YEAR ||--o{ ATTENDANCE_SESSION : "Restrict"
    SECTION ||--o{ ATTENDANCE_SESSION : "Restrict"
    SUBJECT ||--o{ ATTENDANCE_SESSION : "Restrict; SUBJECT type only"
    USER ||--o{ ATTENDANCE_SESSION : "markedBy (Restrict)"
    ATTENDANCE_SESSION ||--o{ ATTENDANCE_RECORD : "Restrict"
    ENROLLMENT ||--o{ ATTENDANCE_RECORD : "Restrict — NEVER Student"
    ENROLLMENT ||--o{ LEAVE_REQUEST : "Restrict"
    PARENT ||--o{ LEAVE_REQUEST : "Restrict"
    USER ||--o{ LEAVE_REQUEST : "decidedBy (nullable, Restrict)"
    ATTENDANCE_RECORD ||--o{ ATTENDANCE_CORRECTION : "Restrict"
    USER ||--o{ ATTENDANCE_CORRECTION : "requestedBy + decidedBy (Restrict)"
    ACADEMIC_YEAR ||--o{ HOLIDAY : "Cascade (calendar composition)"

    ATTENDANCE_SESSION {
        date date "IST calendar date — @db.Date"
        enum sessionType "MORNING|AFTERNOON|SUBJECT"
        string subjectId "nullable — non-null IFF type SUBJECT (CHECK)"
        enum status "OPEN|FINALIZED"
        bool isHolidayOverride "explicit, audited"
        string id "partial UKs: (section,date,type) WHERE subject NULL; (section,date,type,subject) WHERE NOT NULL"
    }
    ATTENDANCE_RECORD {
        enum status "PRESENT|ABSENT|LATE|HALF_DAY|LEAVE — no HOLIDAY value"
        string id "UK(sessionId, enrollmentId)"
    }
    LEAVE_REQUEST {
        enum status "PENDING|APPROVED|REJECTED|CANCELLED"
        date fromDate "CHECK from <= to"
        date toDate "EXCLUDE gist: no live-overlap per enrollment"
    }
    ATTENDANCE_CORRECTION {
        enum fromStatus "before/after kept on the row"
        enum toStatus "CHECK from <> to"
        enum status "PENDING|APPROVED|REJECTED — partial UK: one PENDING per record"
    }
    HOLIDAY {
        date date "UK(academicYearId, date)"
        enum type "NATIONAL|SCHOOL|FESTIVAL|EMERGENCY_CLOSURE"
    }
```

Shipped-vocabulary notes (ADR-011): attendance joins **Enrollment, never Student** — history survives promotion because the year's enrollment row is immutable after close. A holiday is the **absence of a session** (no HOLIDAY status; Holiday table resolves REVIEW_FINDINGS B1). `LeaveRequest` FKs Enrollment directly (supersedes the PRD's `studentId` keying); on APPROVED the service upserts LEAVE into existing sessions per school day and pre-fills future sessions at creation (the B2 invariant, restated for sessions). Cross-table service invariants (not FKs): session date within its year + year ACTIVE at creation; record's enrollment matches the session's section/year at marking; no session on a Holiday date unless `isHolidayOverride` (audited).

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
        string pdfPath "private storage PATH, signed on read (v1.3)"
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

**Adopted v1.3:** `Holiday(schoolId, date, name, classLevelId?)` + working-weekday config in typed `SchoolSettings` (Dev PRD §8.19) — the school-day source of truth for leave approval and the absence job. Storage fields are now `*Path` (`logoPath`, `photoPath`, `pdfPath`, `attachmentPaths`, `filePath`) per decision #24.

## onDelete policy summary (DATABASE_CONVENTIONS §7)

| Cascade (composition) | Restrict (history/money) |
|---|---|
| Staff/Guardian→User, GuardianStudent, DeviceToken, Notification, GradeBand→Scale, ExamSubject→Exam, Message→Thread, FeeItem→Structure, InvoiceLine→Invoice, Holiday→AcademicYear (M4) | Mark, Enrollment, Invoice, Payment, ReportCard, all academic structure; **M4 shipped:** AttendanceSession (year/section/subject/markedBy), AttendanceRecord (session/enrollment), LeaveRequest (enrollment/parent/decidedBy), AttendanceCorrection (record/requestedBy/decidedBy) |
