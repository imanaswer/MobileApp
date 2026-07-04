# Database Conventions — School Management Portal

Standards for PostgreSQL (via Supabase) modelled with Prisma in `packages/db`. Builds on Dev PRD §6, `CODING_STANDARDS.md` §5, ADR-003 (repositories), ADR-007 (audit), ADR-008 (single-tenant), ADR-009 (partial indexes).

---

## 1. Naming conventions
- **Models:** `PascalCase`, **singular** — `Student`, `Enrollment`, `LeaveApplication` (one row = one entity; reads naturally with Prisma relations). We do **not** pluralize table names.
- **Fields:** `camelCase` — `admissionNo`, `isClassTeacher`, `publishedAt`.
- **Enums:** `PascalCase` type, `UPPER_SNAKE_CASE` values — `EnrollmentStatus.PROMOTED`.
- **Booleans** read as predicates — `isCurrent`, `hasPractical`, `isPrimary`, `isAbsent`.
- **Money** columns are `Int` minor units (paise); never `Float` for currency.

## 2. Foreign key & relation naming
- Scalar FK column: **`<entity>Id`** — `enrollmentId`, `classSubjectId`, `markedByStaffId`.
- Relation field named by its **role**, not always the type: `markedBy Staff`, `enteredBy Staff`, `createdBy Staff`, `appliedBy User`, `decidedBy Staff?`. Plain ownership uses the type name (`student Student`, `division Division`).
- Back-relations are the plural role: `attendanceMarked`, `marksEntered`, `leaveDecisions`.
- **In-domain references are explicit relations.** The only intentionally **loose** scalars are `schoolId` (ADR-008), `AuditLog`/`ImportJob` actor+entity refs (ADR-007), and `Announcement.targetId` (polymorphic). Each is annotated inline in the schema.

## 3. Indexes
- **Index every FK that is queried** and every documented query path; use **composite** indexes ordered by selectivity/usage (e.g. `[academicYearId, divisionId]`, `[userId, readAt]`, `[schoolId, createdAt]`).
- **Do not over-index** — every index costs writes. Add one only for a real query path (the tRPC procedures in Dev PRD §7) and note *why* in a comment.
- **Unique constraints** model real business rules: `Division[classLevelId,name]`, `ClassSubject[classLevelId,subjectId,academicYearId]`, `ExamSubject[examId,classSubjectId]`, `Enrollment[studentId,academicYearId]`, `Attendance[enrollmentId,date,period]`, `TimetablePeriod[divisionId,dayOfWeek,periodNo]`, `FeatureFlag[schoolId,key]`, `User.phone`, `User.email`, `Student.admissionNo`.
- **"Unique when present" → partial unique index** (raw SQL in the migration; `@@unique` can't express `WHERE`): `ReportCard ... WHERE "examId" IS NOT NULL` (ADR-009), `GuardianStudent("studentId") WHERE "isPrimary"`, and `AcademicYear("schoolId") WHERE "isCurrent"` (**exactly one current year** — v1.3, REVIEW_FINDINGS B6; rollover flips both rows in one transaction). When a column should dedupe, prefer a **non-null sentinel** so `@@unique` works (`Attendance.period @default(0)`).

## 4. Timestamps
- **`createdAt DateTime @default(now())`** on every entity table. **`updatedAt DateTime @updatedAt`** on tables that mutate (e.g. `Mark`).
- **Store UTC, render IST** (Asia/Kolkata) — Dev PRD §2. Use `packages/utils` IST helpers; never raw `new Date()` for calendar logic.
- **Calendar-date columns use `@db.Date` — DECIDED (v1.3, Dev PRD decision #22):** attendance `date`, exam dates, leave from/to, academic-year start/end, `Holiday.date`, homework `dueDate`. The date is DB-typed so unique keys and range logic can't drift by a UTC off-by-one.
- **Storage fields hold private-bucket PATHS, never URLs (v1.3, decision #24):** name them `*Path`/`*Paths` (`pdfPath`, `attachmentPaths`, `photoPath`, `logoPath`, `filePath`). Signed URLs are minted per read after an authz check (ADR-004) and are never persisted.

## 5. Soft deletes & lifecycle
- **No generic `deletedAt` soft-delete column.** Instead we model lifecycle with **status enums**: `EnrollmentStatus` (`ADMITTED→ACTIVE→PROMOTED/RETAINED/TRANSFERRED/DROPPED→ALUMNI`), `UserStatus` (`INVITED/ACTIVE/DISABLED`), `LeaveStatus`, `InvoiceStatus`, `PaymentStatus`. This carries *meaning* (why/when an entity left a state) that a boolean delete flag cannot, and keeps history for audits/reports.
- **Mutations "archive"/"disable"** rather than delete (API `archive`, `disableUser`, `drop`).
- **Hard deletes** are limited to true compositions/join rows via `onDelete: Cascade` (§7) — never to entities with audit, financial, or academic history.

## 6. Audit strategy
- A single **append-only `AuditLog`** is written by **business services in the same transaction** as the mutation (ADR-007), for: marks, attendance edits, role/user changes, enrollment/promotion, payments.
- Stores `actorUserId`, `action`, `entityType`, `entityId`, `beforeJson`, `afterJson`, `createdAt`, `schoolId`. References are **intentionally loose/polymorphic** so history outlives the rows it describes. Never updated or deleted. Indexed `[entityType,entityId]` and `[schoolId,createdAt]`.

## 7. Cascading rules
- **`onDelete` is always explicit** — no relying on defaults.
- **`Cascade`** only for compositions/joins whose children have no independent meaning: `GradeBand→GradeScale`, `FeeItem→FeeStructure`, `InvoiceLine→Invoice`, `ExamSubject→Exam`, `Message→MessageThread`, `GuardianStudent→Guardian/Student`, `DeviceToken→User`, `Notification→User`, `Staff/Guardian→User`.
- **`Restrict`/no-action (default)** for everything carrying data, money, or audit value (`Mark`, `Attendance`, `Enrollment`, `Payment`, `Invoice`, academic structure) — deletion is blocked; use lifecycle status instead.

## 8. Nullable field policy
- **Default to `NOT NULL`.** A column is nullable **only when "absent/unknown" is a genuine domain state** (`Student.dob`, `Subject.code`, `Mark.theory` when practical-only, `decidedByStaffId` before a decision, `examId` on a consolidated report card).
- **Prefer a non-null sentinel or enum over nullable when it unlocks a constraint** (e.g. `Attendance.period = 0` for whole-day, so the unique key is enforceable). NULLs are distinct in unique indexes — account for that (use a partial index, §3).
- Every intentional nullable is **documented inline** with the reason.

## 9. Prisma conventions
- **Schema, migrations, seed, and repositories live in `packages/db`; nothing else imports `@prisma/client`** (ADR-003). Callers use repositories that centralize `schoolId` scoping and lifecycle filters.
- Models/fields follow §1–§2; relations explicit with deliberate `onDelete`. Run **`prisma validate`** locally and in CI as the gate before any migration.

## 10. Migration rules
- **Never edit an applied migration** — add a new one. One logical change per migration; reviewed in PR.
- CI runs `prisma validate` → `prisma migrate deploy` before deploy; **merge is blocked on failure** (Dev PRD §11).
- **Partial indexes and other constructs Prisma can't express** are added as **raw SQL inside the migration** and mirrored by a schema comment (§3).
- **Data migrations are separate** from schema migrations and must be idempotent and re-runnable. Prefer expand→migrate→contract for breaking changes. Seed sets one school, super-admin, default (assumption-flagged) SCERT grade scale, current year, and tier feature flags.

## 11. Transaction rules
- Wrap in **`prisma.$transaction`** whenever multiple writes must be atomic: **mutation + its `AuditLog` row**, bulk operations (`markBulk`, `enterMarksBulk`, `promoteBulk`, `bulkImport` per-batch), and any money movement.
- Keep transactions **short**; do no network I/O (push/SMS/Razorpay) inside them — enqueue side-effects after commit.
- **Idempotency** is required for anything retried: webhooks (Razorpay), scheduled jobs (absence cutoff, reminders — §8.9), and upsert-keyed mutations (attendance). Re-running must not duplicate.

## 12. Single-tenant / schoolId
- Every core table carries a **loose `schoolId` scalar**; there is one `School` row today. The **business/repository layer always scopes by `schoolId`**, so multi-tenant correctness is exercised now and promotion to a real FK is a clean future migration (ADR-008). No multi-tenant auth/routing is built.
