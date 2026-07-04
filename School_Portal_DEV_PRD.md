# School Management Portal — Developer PRD (v1.3, build-ready)

**Audience:** the development team. **Type:** single-school deployment (one paying school).
**Client:** **Sri Gujarathi Vidhyalaya Higher Secondary School** (SGV HSS), Beach Rd, Mananchira, Kozhikode, Kerala 673032 · managed by Sri Gujarati Vidhyalaya Association (SGVA) · English-medium, co-education, ~153 years old · https://www.srigujaratividhyalaya.com/
**Status:** approved scope, ready to build.

> **Client-profile notes (v1.3):** the school's website states it is a "Kerala Government **recognised unaided** English medium" school, while the client brief said **aided** — **[CONFIRM §16.12]**, because aided/unaided determines what the `fees` add-on may legally collect (unaided = tuition; aided = typically only PTA/special fees). The school community is Gujarati-heritage: **[CONFIRM §16.13]** whether a Gujarati (`gu`) UI locale is wanted as a paid add-on later — the `Locale` enum and i18n catalogs extend cleanly; en + ml remain the committed v1 languages.
>
> **Corrections in v1.3 (review fixes — see `docs/REVIEW_FINDINGS.md`):** milestones renumbered to match the codebase (M1 = auth foundation; §13) with payments still attached to the same deliverables; §4.4 rewritten to match ADR-002's M1 refinement (**no transport role gate** — permission + scope in the business layer over a DB-resolved `Principal`); **`Holiday` model + typed `SchoolSettings`** added (school-day source of truth for leave §8.7 and the absence job §8.9); calendar-date columns are **`@db.Date`**; **`AcademicYear.isCurrent` gets a partial unique index** (exactly one current year); storage fields renamed **`*Path`** (private-bucket paths, signed on read — ADR-004); leave↔period-wise invariant defined (§8.7); staff-provisioning invariant (§8.2); notification channel selection is **policy-only in v1** (no per-user channel prefs — §4.6); `notifications.deregisterDevice`, `leave.cancel`, `exams.publishResults` added to §7. No product scope changed.
>
> **Corrections in v1.2 (architecture hardening):** 12-package monorepo with `business` split from `core` (§4.1); authorization clarified as application-enforced with RLS as defense-in-depth (§4.4, §10, ADR-002/003/004); `Attendance.period` made non-null to enforce uniqueness (§6, §8.4); production unique constraints, indexes, and explicit foreign keys added across the schema with deliberate `onDelete` rules (§6); `ReportCard.examId` kept **optional** with exam-bound uniqueness via a partial unique index (§8.5, ADR-009); Leave→Attendance enrollment resolution documented (§8.7); notification provider abstraction defined (§4.6, ADR-005); formal ADRs added under `docs/architecture/`. No product scope changed.
>
> **Corrections in v1.1:** auth model resolved to **Supabase Auth** (no self-stored passwords); Prisma schema completed with all relations (validates); events-calendar, notification-scheduling and timezone decisions added. This document — not the product PRD — is the source of truth for build scope and the schema.

Where it says **[CONFIRM]**, the dev lead must get an answer from the client before that module starts (collected in §16). Do not silently assume.

---

## 1. Product summary & scope

A management portal for **one school** connecting three user groups — office/principal, teachers and parents (students are records, not logins) — across attendance, academics (Kerala SCERT/DHSE grading), homework, leave, communication and reporting. Delivered as a **web admin dashboard + a native mobile app (Android & iOS)** on one shared backend.

### Scope is split into Core (always built) and Add-ons (feature-flagged)

**CORE — must all ship (the ₹1.49L foundation):**
- Authentication & onboarding (phone OTP + email/password via Supabase Auth), activation, recovery
- Separate portals for office, teachers and parents (web + app)
- Student, guardian and staff records + **bulk import**
- Classes, divisions, subjects, teacher assignments
- Daily attendance with auto percentages
- Exams, marks, **Kerala A+→E grade reports**, **printable report cards (PDF)**
- Homework & notes — teacher posts, parents (and the child) read; distribution-only (no online upload)
- **Leave requests** (parent applies → class teacher approves)
- School announcements + teacher↔parent messaging
- In-app push notifications
- English + Malayalam
- Full audit log (change history)

**ADD-ONS — build behind feature flags; enable per the tier the school buys:**
| Flag key | Module | In likely contract? |
|---|---|---|
| `fees` | Online fee collection (Razorpay) | **Yes** (Recommended tier) |
| `whatsapp` | WhatsApp alerts | **Yes** (Recommended tier) |
| `timetable` | Timetable builder | Optional |
| `analytics` | Insight dashboards | Optional |
| `offline` | Offline attendance (queue + sync) | Optional |

> Build the **core first**. Add-ons are independent modules gated by `FeatureFlag`; the chosen tier decides which flags are ON at go-live, everything else stays built-but-off for later with no rebuild. **[CONFIRM final tier]**

**Explicitly NOT in core** (don't build unless purchased/requested): fees beyond the `fees` flag, transport/bus, library, hostel, biometric/RFID, an events **calendar** (§8.18), **digital homework uploads** (distribution-only by default — §8.6), public marketing site, multi-school SaaS.

---

## 2. Confirmed product decisions

- **Single-tenant.** One school; `schoolId` on all core tables for portability, but no multi-tenant auth/routing.
- **Platforms:** Next.js web (office/principal primary) + Expo app (all logged-in roles: staff + parents). Parents are the primary mobile users. Heavy admin is web-primary; teacher daily work (attendance, marks, homework) is fully mobile-capable.
- **Board:** Kerala SCERT (to SSLC) / DHSE. **Grade-band based (A+→E)**, CE + Terminal. **Grade bands configurable, never hardcoded.**
- **Languages:** English + Malayalam, per-user preference.
- **Auth:** **Supabase Auth** owns credentials + OTP and issues the JWT. Our `User` table is a **profile keyed to the Supabase auth UID**; we never store passwords. No public self-signup.
- **Notifications:** in-app **push primary and free**; SMS/WhatsApp only for critical events.
- **Timezone:** **IST (Asia/Kolkata)** everywhere — store UTC, render IST; attendance/exam dates are IST calendar dates (guard against UTC off-by-one).

---

## 3. Tech stack (locked)

| Layer | Choice |
|---|---|
| Web | Next.js 15 (App Router), TypeScript |
| Mobile | Expo (React Native) + expo-router, TypeScript |
| Shared API | tRPC (+ Zod) |
| DB | PostgreSQL via Supabase |
| ORM / migrations | Prisma |
| Auth | **Supabase Auth** (phone OTP + email/password); OTP SMS via the same provider as alerts (MSG91/Gupshup), configured once behind the notifications layer (§4.6) |
| Storage | Supabase Storage |
| Push | Expo Push (FCM/APNs) |
| SMS / WhatsApp | MSG91 or Gupshup (behind one adapter) |
| Email | Resend |
| Payments (`fees`) | Razorpay (HMAC verification) |
| Background jobs | Supabase scheduled functions / cron |
| Data fetching | TanStack Query |
| i18n | next-intl (web) + i18next/expo-localization (mobile) |
| PDF | server-side render |
| Analytics / errors | PostHog + Sentry |
| Hosting | Vercel (web + tRPC API), Supabase Cloud, EAS |

No additional core dependencies without dev-lead sign-off.

---

## 4. Architecture

### 4.1 Monorepo (Turborepo)
```
/apps
  /web            Next.js — dashboard + hosts tRPC API routes
  /mobile         Expo app — staff + parents
/packages
  /api            tRPC routers — transport only: validate (Zod) → authz guard → call business → shape response
  /auth           Supabase session helpers, JWT verification, RBAC scope guards
  /business       application use-cases & orchestration (services): compose repositories + core rules,
                  enforce authz scope, write AuditLog, fire notifications. The only place a "feature" lives.
  /constants      enums, config constants, FEATURE_FLAG keys, ROLE keys, notification types — no logic
  /core           framework-independent DOMAIN logic only: grade calc, attendance %, promotion/lifecycle
                  rules, pure functions. No Prisma, no tRPC, no React imports.
  /db             Prisma schema, migrations, seed, and repositories (the only module that imports Prisma)
  /i18n           en + ml catalogs + locale helpers
  /notifications  Notification Service + Push/SMS/WhatsApp adapters behind one provider interface
  /types          shared TypeScript types & DTOs (no runtime code)
  /ui             shared design tokens / primitives (web: shadcn-based; native: NativeWind)
  /utils          generic, domain-agnostic helpers (date/IST, formatting, result/error helpers)
  /validation     shared Zod schemas (reused by tRPC inputs, RHF forms, and import validation)
```

**Package boundary rules (enforced in review; later by ESLint `no-restricted-imports`):**
- `core` is pure: it may import `types`, `constants`, `utils` only — never `db`, `api`, `auth`, `notifications`, or any framework.
- `business` orchestrates: it may import `db` (repositories), `core`, `notifications`, `auth`, `validation`, `types`, `constants`, `utils`. It is the **only** layer that contains feature/use-case logic.
- `api` is thin: it may import `business`, `validation`, `auth`, `types`, `constants` — never `db` (Prisma) directly.
- `db` exposes **repositories**; nothing outside `db` imports `@prisma/client`.
- `apps/web` and `apps/mobile` import `api` (client), `ui`, `i18n`, `types`, `constants`, `validation`, `utils` — never `db` or `business` directly.

### 4.2 Layering
```
[ Web UI / Mobile UI ]      ← presentation
[ tRPC routers (api) ]      ← transport: Zod validation, authz guard, call a business service, shape response
[ Business services ]       ← use-cases & orchestration: authz scope, audit, notifications, transactions
[ Repositories (db) ]       ← data-access boundary over Prisma (the only Prisma consumer)
[ Prisma + Postgres ]       ← infrastructure
[ Domain (core) ]           ← pure rules (grade calc, attendance %, promotion), no framework imports
```
Dependencies point inward. **Routers never contain business logic** — they validate, authorize, and delegate to a service in `packages/business`. **Services never touch Prisma directly** — they call repositories in `packages/db` and pure functions in `packages/core`. This is the SOLID/DIP boundary the contract requires, and it keeps the same use-case logic shared identically by web and mobile.

### 4.3 Auth & session flow (Supabase Auth)
1. Supabase verifies OTP / email+password and returns a JWT.
2. First sign-in creates/activates a `User` profile with `id = Supabase auth UID`, role, status (pre-created at import).
3. tRPC context verifies the JWT, loads the profile, exposes `{ userId, role, schoolId }`.
4. **No password hashes stored by us.** Recovery = Supabase reset (staff) / OTP re-login (parents).

### 4.4 Authorization

**Authorization is application-enforced.** The primary and authoritative authz path (per ADR-002 incl. its M1 refinement) is:

```
tRPC router (authenticate only — protectedProcedure)
  → Business service: Principal → assertCan (permission) → assertScope (ownership) → audit
    → Repository
      → Prisma → Postgres
```

Transport does **authentication only**: the tRPC context verifies the Supabase JWT, yielding the identity (`AuthUser` — userId/email/phone, deliberately **no role**). The business layer builds the **`Principal`** `{ userId, schoolId, role, status }` from the **DB `User` profile** (never from the JWT or client input) and enforces `status === ACTIVE` per request. There is **no transport role gate** — a role read at transport would come from the request context rather than the DB, the exact anti-pattern this design forbids.

Authorization then has two separate concerns in `packages/business`:
- **Permission** — `assertCan(principal, PERMISSION)` against the fixed `ROLE_PERMISSIONS` policy (`packages/constants`, evaluated by pure `can()` in `packages/core`). Code checks a permission, never a hard-coded role string.
- **Scope** — `assertScope(rule, principal, facts)` with pure `ScopeRule` predicates over already-loaded ownership facts: teacher → assigned divisions/subjects; class teacher (`TeacherAssignment.isClassTeacher`) → own division; guardian → linked students; office admin → school-wide non-destructive; super admin → all.

Every authorization decision happens here, in TypeScript, where it is testable and auditable. The full permission × role × scope catalog is `docs/PERMISSIONS_MATRIX.md`.

**Supabase RLS is NOT the primary authorization mechanism — it is defense-in-depth.** Because Prisma connects over a privileged `DATABASE_URL`, it does **not** run as the request's user and therefore **bypasses RLS**; relying on RLS to protect the tRPC data path would be a false sense of security. RLS instead protects the surfaces that touch Supabase directly and are *not* mediated by tRPC:
- **Supabase Storage** objects (homework attachments, report-card PDFs, import files) — buckets are private; access is via short-lived signed URLs minted server-side after a tRPC authz check.
- **Signed URL** issuance scope and any **direct Supabase client access** added later (e.g. realtime).
- A **last-resort backstop** if a query ever reaches Postgres outside the service layer.

So: **authz lives in tRPC + business; RLS exists for Storage, signed URLs, future direct access, and defense-in-depth.** See ADR-002 (API layer), ADR-003 (repositories), ADR-004 (storage), and §10 (security).

### 4.5 Feature flags
`FeatureFlag(schoolId, key, enabled)`. Add-on routers/UI check the flag; off = hidden + endpoints return `FORBIDDEN`. Seed from contracted tier.

### 4.6 Notifications (provider abstraction)

No provider name (Expo, MSG91, Gupshup, FCM/APNs, Twilio) appears anywhere in feature code. All of it sits behind **one interface in `packages/notifications`**, so providers are swapped by configuration, never by editing call sites:

```
Business service
  → NotificationService.send(event)        // channel-agnostic; resolves user prefs + recipients
      → PushAdapter        (Expo Push → FCM/APNs)
      → SmsAdapter         (MSG91 | Gupshup, selected by env)
      → WhatsAppAdapter    (Gupshup template messages)
      → InAppAdapter       (writes a Notification row)
```

```ts
// packages/notifications — the only contract the rest of the app sees
export interface NotificationAdapter {
  readonly channel: NotificationChannel;            // IN_APP | PUSH | SMS | WHATSAPP
  send(msg: OutboundMessage): Promise<DeliveryResult>;
}
export interface NotificationService {
  send(event: NotificationEvent): Promise<void>;    // resolves recipients + locale; channels by POLICY
}
```

**Channel selection is policy-only in v1** (v1.3 decision): the event→channel matrix (§9, `docs/API_INVENTORY.md`) plus feature flags decide channels; the only per-user inputs are `User.locale` and device tokens. There is **no per-user channel-preference model** — if the school later wants per-guardian opt-outs (e.g. "no WhatsApp"), that is a small future add-on (`NotificationPreference` model + settings UI), not v1 scope.

- **OTP also goes through the adapter layer** — OTP delivery is Supabase Auth's responsibility, but the SMS *provider* it uses (MSG91/Gupshup) is configured once in the same place the `SmsAdapter` reads, so there is a single provider source of truth and no duplicate credentials. Application code never calls a provider SDK for OTP.
- Channel selection per event is policy (see §9): push is primary/free; SMS/WhatsApp only for critical events; WhatsApp only when the `whatsapp` flag is on. Adapters are individually testable with a fake `DeliveryResult`.
- See ADR-005 (notifications).

---

## 5. Roles & RBAC matrix

| Capability | Super Admin | Office Admin | Teacher | Parent | Accountant* |
|---|:--:|:--:|:--:|:--:|:--:|
| Manage users & roles | ✓ | – | – | – | – |
| Manage academic structure | ✓ | ✓ | – | – | – |
| Bulk import | ✓ | ✓ | – | – | – |
| Mark attendance | ✓ | ✓ | own divisions | – | – |
| Enter marks | ✓ | – | own subjects | – | – |
| Post homework/notes | ✓ | – | own classes | – | – |
| Approve leave | ✓ | – | if class teacher † | – | – |
| Apply for leave (for the child) | – | – | – | own child | – |
| Announcements (school-wide) | ✓ | ✓ | – | – | – |
| Announcements (class/division scope) | ✓ | ✓ | own division, if class teacher † | – | – |
| View student records (roster/profile) | ✓ | ✓ | own divisions | own child(ren) | – |
| Message guardians | ✓ | – | own students | reply only | – |
| View child data | – | – | – | own child(ren) | – |
| Year-end promotion | ✓ | – | – | – | – |
| Fees (`fees`) | ✓ | view | – | pay/view own | ✓ |
| Audit log | ✓ | – | – | – | – |

*Accountant exists only when `fees` is enabled.

**† There is no "Class Teacher" role.** A class teacher is a `Role = TEACHER` whose `TeacherAssignment.isClassTeacher` is `true` for a division. Division-wide rights (e.g. leave approval) derive from that flag:

```ts
// permission check
if (user.role === "TEACHER" && assignment.isClassTeacher) {
  allow(LEAVE_APPROVAL, assignment.divisionId);
}
```

Students do not log in — they are records, and a parent is the family-facing account.

**Provisioning invariant (v1.3, B3):** every `SUPER_ADMIN`, `OFFICE_ADMIN`, and `TEACHER` user gets a **`Staff` row** at creation (seed, import, and invite flows all enforce this). Attendance/marks/homework FKs (`markedByStaffId`, `enteredByStaffId`, `createdByStaffId`) require it — an admin without a Staff row could not mark attendance.

---

## 6. Data model (Prisma schema)

Drop-in starting schema for the **Supabase Auth** path. `User.id` equals the Supabase `auth.users` UID; credentials/OTP live in Supabase, never here.

**v1.1 schema hardening (this revision):** every in-domain `*Id` has been promoted to an explicit Prisma relation with deliberate `onDelete` rules; production unique constraints and query-path indexes were added; `Attendance.period` is now non-null (`@default(0)`) so its uniqueness is actually enforced; `ReportCard.examId` is **kept optional** (a card may be exam-bound, or a future consolidated/annual/promotion/custom report), with exam-bound uniqueness enforced by a **partial unique index** instead of a plain composite unique — see ADR-009 and §8.5. The only **intentionally loose** scalar references that remain are: (a) every `schoolId` (single-tenant portability — ADR-008), (b) `AuditLog`/`ImportJob` actor + entity references (append-only history kept decoupled — ADR-007), and (c) `Announcement.targetId` (polymorphic — points at a `ClassLevel` *or* a `Division` depending on `scope`, so no single FK is possible). Each is annotated inline with its rationale. Relation symmetry hand-verified; run `prisma validate` locally as the final gate before the first migration.

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

// ---------- enums ----------
enum Role { SUPER_ADMIN OFFICE_ADMIN TEACHER PARENT ACCOUNTANT }  // no STUDENT — students are records, parents are the family login
enum UserStatus { INVITED ACTIVE DISABLED }
enum Gender { MALE FEMALE OTHER }
enum EnrollmentStatus { ADMITTED ACTIVE PROMOTED RETAINED TRANSFERRED DROPPED ALUMNI }
enum AttendanceStatus { PRESENT ABSENT HALF_DAY LEAVE HOLIDAY }
enum LeaveStatus { PENDING APPROVED REJECTED CANCELLED }
enum AnnouncementScope { SCHOOL CLASS DIVISION }
enum Locale { EN ML }
enum NotificationChannel { IN_APP PUSH SMS WHATSAPP }
enum InvoiceStatus { PENDING PARTIAL PAID OVERDUE CANCELLED }
enum PaymentStatus { CREATED CAPTURED FAILED REFUNDED }

// ---------- tenant ----------
// `schoolId` is kept as a LOOSE scalar on every table (not a relation) on purpose:
// single-tenant today (one School row), and a loose column is a clean promotion to a
// real FK when we go multi-tenant. All reads/writes are school-scoped in the business
// layer regardless. See ADR-008 (single-tenant → future SaaS).
model School {
  id            String   @id @default(cuid())
  name          String   // "Sri Gujarathi Vidhyalaya Higher Secondary School"
  address       String?
  logoPath      String?  // PRIVATE storage PATH (not URL) — signed on read, ADR-004
  defaultLocale Locale   @default(EN)
  settings      Json?    // TYPED: validated by the versioned `SchoolSettings` Zod schema in
                         // packages/validation and read only via one accessor in packages/business.
                         // Owns: attendanceMode (DAILY | PERIOD), periodsPerDay, absenceCutoffIST,
                         // workingWeekdays (e.g. Mon–Fri/Sat), academic display prefs. See §8.19.
  createdAt     DateTime @default(now())
}

// ---------- identity (profile keyed to Supabase auth UID) ----------
model User {
  id           String        @id                 // == Supabase auth.users.id
  schoolId     String
  role         Role
  phone        String?       @unique
  email        String?       @unique
  status       UserStatus    @default(INVITED)
  locale       Locale        @default(EN)
  lastLoginAt  DateTime?
  createdAt    DateTime      @default(now())
  staff             Staff?
  guardian          Guardian?
  deviceTokens      DeviceToken[]
  notifications     Notification[]
  announcements     Announcement[]
  sentMessages      Message[]
  leaveApplications LeaveApplication[]
  @@index([schoolId, role])
}

model Staff {
  id          String   @id @default(cuid())
  schoolId    String
  userId      String   @unique
  name        String
  designation String?
  photoPath   String?  // PRIVATE storage PATH — signed on read, ADR-004
  phone       String?
  email       String?
  user             User                @relation(fields: [userId], references: [id], onDelete: Cascade)
  assignments      TeacherAssignment[]
  attendanceMarked Attendance[]
  marksEntered     Mark[]
  homeworkCreated  Homework[]
  leaveDecisions   LeaveApplication[]
  messageThreads   MessageThread[]
  timetablePeriods TimetablePeriod[]
}

model Student {
  id          String   @id @default(cuid())
  schoolId    String
  admissionNo String   @unique
  name        String
  dob         DateTime?
  gender      Gender?
  photoPath   String?  // PRIVATE storage PATH — signed on read, ADR-004
  bloodGroup  String?
  address     String?
  createdAt   DateTime @default(now())
  guardians         GuardianStudent[]
  enrollments       Enrollment[]
  invoices          Invoice[]
  leaveApplications LeaveApplication[]
  messageThreads    MessageThread[]
  @@index([schoolId])
}

model Guardian {
  id         String  @id @default(cuid())
  schoolId   String
  userId     String  @unique
  name       String
  relation   String?
  phone      String
  occupation String?
  user           User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  students       GuardianStudent[]
  messageThreads MessageThread[]
}

model GuardianStudent {
  guardianId String
  studentId  String
  isPrimary  Boolean  @default(false)
  guardian   Guardian @relation(fields: [guardianId], references: [id], onDelete: Cascade)
  student    Student  @relation(fields: [studentId], references: [id], onDelete: Cascade)
  @@id([guardianId, studentId])
  @@index([studentId])
}

// ---------- academic structure ----------
model AcademicYear {
  id        String   @id @default(cuid())
  schoolId  String
  name      String
  startDate DateTime @db.Date
  endDate   DateTime @db.Date
  isCurrent Boolean  @default(false)
  classSubjects ClassSubject[]
  enrollments   Enrollment[]
  exams         Exam[]
  feeStructures FeeStructure[]
  // EXACTLY ONE current year per school — enforced by a PARTIAL UNIQUE INDEX in the migration
  // (same idiom as ReportCard/GuardianStudent; Prisma can't express WHERE):
  //   CREATE UNIQUE INDEX "AcademicYear_current_key" ON "AcademicYear" ("schoolId") WHERE "isCurrent";
  // Year rollover flips old→false and new→true in ONE transaction. Leave resolution (§8.7),
  // enrollment, and promotion all depend on this invariant. (v1.3, B6)
}

// School calendar: the source of truth for "is this a school day?" (v1.3, B1).
// Consumed by leave→attendance expansion (§8.7) and the absence-cutoff job (§8.9).
// A school day = weekday ∈ SchoolSettings.workingWeekdays AND no Holiday row for the date
// (school-wide, or scoped to the class level when classLevelId is set).
model Holiday {
  id           String   @id @default(cuid())
  schoolId     String
  date         DateTime @db.Date
  name         String
  classLevelId String?  // null = whole school; set = e.g. exam-related holiday for one level
  createdAt    DateTime @default(now())
  @@unique([schoolId, date, classLevelId])
  @@index([schoolId, date])
}

model ClassLevel {
  id        String     @id @default(cuid())
  schoolId  String
  name      String
  order     Int
  divisions     Division[]
  classSubjects ClassSubject[]
  enrollments   Enrollment[]
  feeStructures FeeStructure[]
}

model Division {
  id           String     @id @default(cuid())
  schoolId     String
  classLevelId String
  name         String
  classLevel         ClassLevel          @relation(fields: [classLevelId], references: [id])
  teacherAssignments TeacherAssignment[]
  enrollments        Enrollment[]
  homework           Homework[]
  timetablePeriods   TimetablePeriod[]
  @@unique([classLevelId, name])  // no two divisions named "A" under the same class
}

model Subject {
  id           String  @id @default(cuid())
  schoolId     String
  name         String
  code         String?
  hasPractical Boolean @default(false)
  classSubjects ClassSubject[]
}

model ClassSubject {
  id             String @id @default(cuid())
  classLevelId   String
  subjectId      String
  academicYearId String
  classLevel         ClassLevel          @relation(fields: [classLevelId], references: [id])
  subject            Subject             @relation(fields: [subjectId], references: [id])
  academicYear       AcademicYear        @relation(fields: [academicYearId], references: [id])
  teacherAssignments TeacherAssignment[]
  examSubjects       ExamSubject[]
  homework           Homework[]
  timetablePeriods   TimetablePeriod[]
  @@unique([classLevelId, subjectId, academicYearId])  // one mapping per class+subject+year
}

model TeacherAssignment {
  id             String  @id @default(cuid())
  staffId        String
  divisionId     String
  classSubjectId String?
  isClassTeacher Boolean @default(false)
  staff        Staff         @relation(fields: [staffId], references: [id], onDelete: Cascade)
  division     Division      @relation(fields: [divisionId], references: [id])
  classSubject ClassSubject? @relation(fields: [classSubjectId], references: [id])
  @@index([staffId])
  @@index([divisionId])  // resolve "who teaches/owns this division" (class-teacher check)
}

// ---------- enrollment (carries lifecycle) ----------
model Enrollment {
  id             String           @id @default(cuid())
  schoolId       String
  studentId      String
  academicYearId String
  classLevelId   String
  divisionId     String
  rollNo         Int?
  status         EnrollmentStatus @default(ACTIVE)
  student      Student      @relation(fields: [studentId], references: [id])
  academicYear AcademicYear @relation(fields: [academicYearId], references: [id])
  classLevel   ClassLevel   @relation(fields: [classLevelId], references: [id])
  division     Division     @relation(fields: [divisionId], references: [id])
  attendance   Attendance[]
  marks        Mark[]
  reportCards  ReportCard[]
  @@unique([studentId, academicYearId])  // one enrollment per student per year
  @@index([academicYearId, divisionId])
}

// ---------- attendance ----------
// period = 0  → whole-day attendance (DEFAULT, daily mode)
// period = 1..N → period-wise attendance (when the school runs period-wise; [CONFIRM] §16.4)
// `period` is NON-NULL so @@unique([enrollmentId, date, period]) actually enforces one
// row per student per day (period 0) or per student/date/period. A nullable period would
// NOT be enforced — Postgres treats NULLs as distinct in unique indexes. See §8.4.
model Attendance {
  id              String           @id @default(cuid())
  enrollmentId    String
  date            DateTime         @db.Date   // IST calendar date, DB-typed (v1.3, B9) — no UTC drift
  period          Int              @default(0)
  status          AttendanceStatus
  markedByStaffId String
  note            String?
  enrollment Enrollment @relation(fields: [enrollmentId], references: [id])
  markedBy   Staff      @relation(fields: [markedByStaffId], references: [id])
  @@unique([enrollmentId, date, period])
  @@index([date])
}

// ---------- exams, marks, grades ----------
model Exam {
  id             String        @id @default(cuid())
  schoolId       String
  academicYearId String
  name           String
  category       String        // CE, FIRST_TERMINAL, MODEL, ANNUAL ...
  startDate      DateTime?     @db.Date
  endDate        DateTime?     @db.Date
  academicYear AcademicYear  @relation(fields: [academicYearId], references: [id])
  examSubjects ExamSubject[]
  reportCards  ReportCard[]
}

model ExamSubject {
  id             String @id @default(cuid())
  examId         String
  classSubjectId String
  maxTheory      Int
  maxPractical   Int    @default(0)
  passMark       Int
  exam         Exam         @relation(fields: [examId], references: [id], onDelete: Cascade)
  classSubject ClassSubject @relation(fields: [classSubjectId], references: [id])
  marks        Mark[]
  @@unique([examId, classSubjectId])  // a subject appears once per exam
}

model Mark {
  id               String      @id @default(cuid())
  examSubjectId    String
  enrollmentId     String
  theory           Float?
  practical        Float?
  isAbsent         Boolean     @default(false)
  gradeId          String?
  enteredByStaffId String
  updatedAt        DateTime    @updatedAt
  examSubject ExamSubject @relation(fields: [examSubjectId], references: [id])
  enrollment  Enrollment  @relation(fields: [enrollmentId], references: [id])
  grade       GradeBand?  @relation(fields: [gradeId], references: [id])
  enteredBy   Staff       @relation(fields: [enteredByStaffId], references: [id])
  @@unique([examSubjectId, enrollmentId])
  @@index([enrollmentId])  // gather all marks for an enrollment when building a report card
}

model GradeScale {
  id        String      @id @default(cuid())
  schoolId  String
  name      String
  isDefault Boolean     @default(false)
  bands     GradeBand[]
}

model GradeBand {
  id           String     @id @default(cuid())
  gradeScaleId String
  grade        String      // A+, A, B+ ... E  (CONFIGURABLE)
  minPercent   Float
  maxPercent   Float
  gradePoint   Float?
  gradeScale GradeScale @relation(fields: [gradeScaleId], references: [id], onDelete: Cascade)
  marks      Mark[]
}

model ReportCard {
  id           String   @id @default(cuid())
  enrollmentId String
  examId       String?  // OPTIONAL: exam-bound card, OR a consolidated/annual/promotion/custom report (no exam). See ADR-009 + §8.5.
  pdfPath      String   // PRIVATE storage PATH (not URL) — signed on read, ADR-004 (v1.3, B7)
  generatedAt  DateTime @default(now())
  enrollment Enrollment @relation(fields: [enrollmentId], references: [id])
  exam       Exam?      @relation(fields: [examId], references: [id])
  // Uniqueness for EXAM-BOUND cards is enforced by a PARTIAL UNIQUE INDEX created in the migration
  // (Prisma's @@unique cannot express a WHERE clause):
  //   CREATE UNIQUE INDEX "ReportCard_enrollment_exam_key"
  //     ON "ReportCard" ("enrollmentId", "examId") WHERE "examId" IS NOT NULL;
  // → one report card per (enrollment, exam); re-generation upserts that row.
  // Non-exam cards (examId NULL) are INTENTIONALLY unconstrained at the DB so multiple report types
  // (annual/final/promotion/custom) can coexist; a future consolidated-report feature adds its own
  // discriminator + uniqueness rule. The report-card service also validates before insert (§8.5).
  @@index([enrollmentId])  // gather a student's report cards
}

// ---------- homework, notes ----------
model Homework {
  id               String    @id @default(cuid())
  schoolId         String
  divisionId       String
  classSubjectId   String?
  title            String
  body             String?
  dueDate          DateTime? @db.Date
  attachmentPaths  String[]  // PRIVATE storage PATHS — signed on read, ADR-004 (v1.3, B7)
  createdByStaffId String
  createdAt        DateTime  @default(now())
  division     Division      @relation(fields: [divisionId], references: [id])
  classSubject ClassSubject? @relation(fields: [classSubjectId], references: [id])
  createdBy    Staff         @relation(fields: [createdByStaffId], references: [id])
  @@index([divisionId, createdAt])  // list a division's homework newest-first
}
// NOTE: distribution-only by default (Kerala reality: teacher posts → parent reads →
// child writes in notebook → teacher checks physically). If a school wants digital
// homework uploads, add a `HomeworkSubmission` model + `homework-uploads` feature flag.

// ---------- leave ----------
model LeaveApplication {
  id               String      @id @default(cuid())
  studentId        String
  fromDate         DateTime    @db.Date
  toDate           DateTime    @db.Date
  reason           String
  status           LeaveStatus @default(PENDING)
  appliedByUserId  String
  decidedByStaffId String?
  decidedAt        DateTime?
  createdAt        DateTime    @default(now())
  student   Student @relation(fields: [studentId], references: [id])
  appliedBy User    @relation(fields: [appliedByUserId], references: [id])
  decidedBy Staff?  @relation(fields: [decidedByStaffId], references: [id])
  @@index([studentId, status])  // listForApproval / listMine queries
}
// On APPROVED, the leave service resolves studentId → current Enrollment (by current
// AcademicYear) and writes Attendance(status = LEAVE) for the date range. Leave is stored
// per-student (year-independent), attendance per-enrollment (year-bound). See §8.7.

// ---------- communication ----------
model Announcement {
  id              String            @id @default(cuid())
  schoolId        String
  scope           AnnouncementScope
  targetId        String?           // LOOSE polymorphic ref: ClassLevel.id or Division.id depending on `scope`; no FK possible
  title           String
  body            String
  createdByUserId String
  publishedAt     DateTime          @default(now())
  createdBy User @relation(fields: [createdByUserId], references: [id])
  @@index([schoolId, publishedAt])
  @@index([scope, targetId])  // fetch announcements for a given class/division scope
}

// A thread is STRICTLY 1:1 (one staff ↔ one guardian, optional student context) — the single
// Message.readAt works because there is exactly one recipient per message. A future group
// thread would need a MessageRead join table; do not widen this model silently. (v1.3, B12)
model MessageThread {
  id         String    @id @default(cuid())
  schoolId   String
  staffId    String
  guardianId String
  studentId  String?
  createdAt  DateTime  @default(now())
  staff    Staff    @relation(fields: [staffId], references: [id])
  guardian Guardian @relation(fields: [guardianId], references: [id])
  student  Student? @relation(fields: [studentId], references: [id])
  messages Message[]
  @@index([staffId])
  @@index([guardianId])
}

model Message {
  id             String        @id @default(cuid())
  threadId       String
  senderUserId   String
  body           String
  attachmentPaths String[]  // PRIVATE storage PATHS — signed on read, ADR-004
  sentAt         DateTime      @default(now())
  readAt         DateTime?
  thread MessageThread @relation(fields: [threadId], references: [id], onDelete: Cascade)
  sender User          @relation(fields: [senderUserId], references: [id])
  @@index([threadId, sentAt])  // load a thread's messages in order
}

// ---------- notifications / devices ----------
model Notification {
  id        String              @id @default(cuid())
  userId    String
  type      String
  title     String
  body      String
  dataJson  Json?
  channel   NotificationChannel
  readAt    DateTime?
  createdAt DateTime            @default(now())
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, readAt])
}

model DeviceToken {
  id            String   @id @default(cuid())
  userId        String
  expoPushToken String   @unique
  platform      String
  lastSeenAt    DateTime @default(now())
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])  // gather a user's device tokens when sending push
}

// ---------- ops ----------
// AuditLog and ImportJob keep LOOSE actor/entity refs (actorUserId, createdByUserId,
// entityType+entityId) on purpose: they are append-only history that must survive
// independently of the operational rows they describe (retention/immutability), and
// entityType+entityId is polymorphic across every table. See ADR-007 (audit log).
model AuditLog {
  id          String   @id @default(cuid())
  schoolId    String
  actorUserId String
  action      String
  entityType  String
  entityId    String
  beforeJson  Json?
  afterJson   Json?
  createdAt   DateTime @default(now())
  @@index([entityType, entityId])
  @@index([schoolId, createdAt])  // audit viewer: list newest-first, school-scoped
}

model ImportJob {
  id              String   @id @default(cuid())
  schoolId        String
  kind            String
  status          String
  filePath        String   // PRIVATE storage PATH — signed on read, ADR-004
  totalRows       Int      @default(0)
  successRows     Int      @default(0)
  errorRows       Int      @default(0)
  errorReportPath String?
  createdByUserId String
  createdAt       DateTime @default(now())
}

model FeatureFlag {
  id       String  @id @default(cuid())
  schoolId String
  key      String
  enabled  Boolean @default(false)
  @@unique([schoolId, key])
}

// ---------- add-on: timetable ----------
model TimetablePeriod {
  id             String  @id @default(cuid())
  divisionId     String
  dayOfWeek      Int
  periodNo       Int
  classSubjectId String?
  staffId        String?
  startTime      String
  endTime        String
  division     Division      @relation(fields: [divisionId], references: [id])
  classSubject ClassSubject? @relation(fields: [classSubjectId], references: [id])
  staff        Staff?        @relation(fields: [staffId], references: [id])
  @@unique([divisionId, dayOfWeek, periodNo])  // one slot per division/day/period
  @@index([staffId, dayOfWeek])  // teacher double-booking clash detection
}

// ---------- add-on: fees (Razorpay) ----------
model FeeStructure {
  id             String    @id @default(cuid())
  schoolId       String
  academicYearId String
  classLevelId   String?
  name           String
  academicYear AcademicYear @relation(fields: [academicYearId], references: [id])
  classLevel   ClassLevel?  @relation(fields: [classLevelId], references: [id])
  items        FeeItem[]
  invoices     Invoice[]
}

model FeeItem {
  id             String       @id @default(cuid())
  feeStructureId String
  name           String
  amount         Int
  frequency      String
  dueDate        DateTime?
  feeStructure FeeStructure  @relation(fields: [feeStructureId], references: [id], onDelete: Cascade)
  invoiceLines InvoiceLine[]
}

model Invoice {
  id             String        @id @default(cuid())
  schoolId       String
  studentId      String
  feeStructureId String
  totalAmount    Int
  status         InvoiceStatus @default(PENDING)
  dueDate        DateTime?
  createdAt      DateTime      @default(now())
  student      Student       @relation(fields: [studentId], references: [id])
  feeStructure FeeStructure  @relation(fields: [feeStructureId], references: [id])
  lines        InvoiceLine[]
  payments     Payment[]
  @@index([studentId, status])  // dues / overdue lookups and reminders
}

model InvoiceLine {
  id        String  @id @default(cuid())
  invoiceId String
  feeItemId String
  amount    Int
  invoice Invoice @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  feeItem FeeItem @relation(fields: [feeItemId], references: [id])
}

model Payment {
  id                String        @id @default(cuid())
  invoiceId         String
  amount            Int
  status            PaymentStatus @default(CREATED)
  razorpayOrderId   String?
  razorpayPaymentId String?
  razorpaySignature String?
  method            String?
  paidAt            DateTime?
  createdAt         DateTime      @default(now())
  invoice Invoice @relation(fields: [invoiceId], references: [id])
  @@index([invoiceId])
  @@index([razorpayOrderId])  // webhook looks payments up by Razorpay order id
}
```

---

## 7. API surface (tRPC routers)

Each procedure enforces §5 scope. Mutations changing marks, attendance, roles, enrollments or money **must write an `AuditLog` row.** Routers are transport-only (§4.2): they validate input with a `packages/validation` Zod schema and authenticate (`protectedProcedure`), then call a `packages/business` service which authorizes via permission + scope (§4.4) — no role checks at transport, no business logic in routers. Any procedure that notifies a user does so via the `NotificationService` (§4.6), never a provider SDK.

- **auth**: `me`, `registerProfile` (post-Supabase-signup), `setRole`, `disableUser` *(credentials/OTP/reset handled by Supabase Auth)*
- **students**: `list`, `get`, `create`, `update`, `archive`, `bulkImport`
- **guardians**: `create`, `linkToStudent`, `list`, `invite`
- **staff**: `create`, `update`, `assign`
- **academic**: CRUD `academicYears` (incl. transactional `setCurrent`), `classLevels`, `divisions`, `subjects`, `classSubjects`, `teacherAssignments`, `holidays` (school calendar, v1.3), `settings.get/update` (typed `SchoolSettings`, v1.3)
- **enrollment**: `enroll`, `list`, `promoteBulk` (with retain/transfer overrides), `transfer`, `drop`
- **attendance**: `markBulk` (upsert on `[enrollmentId, date, period]`; `period = 0` daily, `1..N` period-wise — never duplicates), `getByDivisionDate`, `studentSummary`
- **exams**: `createExam`, `defineExamSubjects`, `enterMarksBulk`, `getMarks`, `results`, `publishResults` (v1.3 — marks become parent-visible only on publish; publish notifies), `gradeScale.*`, `generateReportCard`
- **homework**: `create`, `listForDivision` (distribution-only; no submit/review)
- **leave**: `apply`, `decide`, `cancel` (v1.3 — parent cancels PENDING; cancelling APPROVED reverts the LEAVE attendance rows, audited), `listMine`, `listForApproval`
- **announcements**: `create`, `list`
- **messages**: `createThread`, `send`, `listThreads`, `markRead`
- **notifications**: `list`, `markRead`, `registerDevice`, `deregisterDevice` (v1.3 — logout hygiene, B13)
- **profile**: `getStudent`, `getStaff`, `update`
- **audit**: `list` (super admin)
- **flags**: `list`, `set` (super admin)
- **fees** *(flag)*: `structures.*`, `invoices.*`, `createOrder`, `verifyPayment` (+ Razorpay webhook), `reminders.send`
- **timetable** *(flag)*: CRUD + `publish`
- **analytics** *(flag)*: `attendanceTrends`, `resultDistribution`, `classPerformance`

---

## 8. Feature specs & acceptance criteria

### 8.1 Auth & onboarding
Parents by **phone OTP**, staff by **email + password** — all via **Supabase Auth** (SMS provider configured for OTP). We store no passwords. Accounts pre-created at import; first sign-in creates/activates the `User` profile (`INVITED→ACTIVE`). Recovery via Supabase reset / OTP re-login. No public signup.
**DoD:** every role signs in on web + app; OTP throttled by Supabase; profile maps to auth UID; mobile sessions persist/refresh.

### 8.2 People & bulk import
CRUD students/guardians/staff; guardian↔student many-to-many with one `isPrimary`. **CSV/Excel import** with column mapping, validation, downloadable error report, `ImportJob` record, partial success.

**v1.3 rules:** (a) **staff provisioning invariant** — creating any SUPER_ADMIN/OFFICE_ADMIN/TEACHER user also creates their `Staff` row (§5, B3); (b) **one login per phone number** — `User.phone` is unique and OTP is the credential, so two guardians sharing a phone cannot both have accounts; import validation flags duplicate guardian phones as row-level warnings (link both guardians to the student, create the login for the primary) rather than failing the batch (B8).
**DoD:** importing ~400 students + guardians creates valid linked profiles; bad rows reported, good committed; every imported staff user has a Staff row; duplicate-phone guardians handled per the rule above.

### 8.3 Academic structure
Manage year, class levels, divisions, subjects (theory/practical), class-subject mapping, teacher assignments, class-teacher flag. **[CONFIRM]** subject list + practicals.
**DoD:** a full class→division→subject→teacher tree set up for the current year.

### 8.4 Attendance
Teacher picks division + date (+ period if period-wise **[CONFIRM §16.4]**) → "mark all present" → flip absentees → save. Statuses Present/Absent/Half-day/Leave/Holiday. Dates are **IST calendar dates stored as `@db.Date`** (v1.3, B9 — the column is date-typed, so the unique key cannot drift by a UTC off-by-one; timestamps elsewhere remain UTC-stored/IST-rendered). Auto daily/monthly/term %. Absent → push (cutoff from `SchoolSettings.absenceCutoffIST`, sent by scheduled job §8.9; never on non-school days §8.19).

**Period encoding (correctness fix, v1.1).** `Attendance.period` is a **non-null `Int` defaulting to `0`**:
- `period = 0` → **whole-day** attendance (the default, daily mode).
- `period = 1..N` → **period-wise** attendance (only if the school runs period-wise).

`@@unique([enrollmentId, date, period])` then guarantees **exactly one attendance row per student per day** (daily mode) or per student/date/period (period mode). A nullable `period` was rejected because **PostgreSQL treats `NULL` as distinct in a unique index** — `(enrollment, date, NULL)` does not collide with another `(enrollment, date, NULL)`, so the default daily flow would silently accept duplicate, conflicting rows for the same student and day. A non-null sentinel (`0`) makes the existing unique constraint do its job with no partial index, no `NULLS NOT DISTINCT`, and no application-level dedupe — the simplest correct design (KISS). Mode (daily vs period-wise) is a school setting; daily uses `0`, period-wise uses `1..N`.

**DoD:**
- 40-student division marked in <~60s; daily/monthly/term percentages correct; absence push fires.
- **Saving the same division+date twice updates the existing rows (upsert on the unique key) — it never creates duplicate attendance rows** (period `0` for daily, `1..N` for period-wise).
- Re-running a save with edits writes an `AuditLog` row for each changed status.

### 8.5 Exams, marks, grades, report cards
Define exams per term (CE + terminals **[CONFIRM]**); theory + practical; pass marks. Bulk marks entry per division. Auto grade from **configurable `GradeScale`/`GradeBand`** (A+→E); totals, result, optional rank **[CONFIRM visibility]**. **Report-card PDF** per student, printable, bilingual. **Every mark edit writes an AuditLog row.**

**Report-card cardinality (v1.2).** A `ReportCard` **may optionally belong to a specific exam** (`examId` is nullable). Today the generation flow is exam-bound, so the service upserts on `(enrollmentId, examId)`; this is guaranteed at the DB by a **partial unique index** `WHERE examId IS NOT NULL` (one card per student per exam, re-gen overwrites). `examId` is deliberately left nullable so the schema can later support **consolidated/annual/final/promotion/custom-period report cards with no DB migration** — those non-exam cards are intentionally not constrained by the partial index, and whatever feature introduces them will add its own discriminator and uniqueness rule. The report-card service also validates before insert (defense in depth + friendly errors), since a DB constraint guarantees integrity but a service check gives a clear message. Rationale and the option analysis are in **ADR-009**.
**DoD addition:** generating an exam-bound card twice updates the same row (no duplicate); a non-exam card is permitted to coexist with exam cards for the same enrollment.
**DoD:** seed a SCERT scale; enter a division's marks; correct grades + clean PDF; edits audited.

### 8.6 Homework & notes (distribution-only)
Teacher posts homework/notes (+ attachments) to a division/subject; parents and the child read it in the app. **No online submission/upload** — this matches the common Kerala flow (child writes in the notebook, teacher checks physically next day).
**DoD:** teacher posts → parents in that division see it with attachments and a push.
**[CONFIRM]** If the school specifically wants digital homework uploads with teacher feedback, scope it as a paid add-on (`homework-uploads`) — re-add a `HomeworkSubmission` model + review UI.

### 8.7 Leave management
Parent/guardian applies (date range + reason) → class teacher approves/rejects → approved leave reflects in attendance.

**Leave → Attendance resolution (clarified, v1.1).** `LeaveApplication` is keyed by **`studentId`** (year-independent — a guardian applies for a *child*), while `Attendance` is keyed by **`enrollmentId`** (year-bound). The leave service bridges the two; it does **not** write attendance against a student directly:

```
Student (studentId on the leave)
  → resolve current Enrollment   (Enrollment where studentId = X AND academicYear.isCurrent = true, status ACTIVE)
    → for each IST date in [fromDate, toDate] that is a SCHOOL DAY
      (weekday ∈ SchoolSettings.workingWeekdays AND no Holiday row — §8.19, v1.3):
        DAILY mode:       upsert Attendance(enrollmentId, date, period = 0, status = LEAVE)
        PERIOD-WISE mode: upsert Attendance(enrollmentId, date, period = p, status = LEAVE) for p in 1..periodsPerDay
```

**Leave × attendance-mode invariant (v1.3, B2):** LEAVE rows are written **in the same period encoding the school's attendance mode uses** — `period = 0` in daily mode, all of `1..N` in period-wise mode. This keeps one consistent record per day and makes it impossible for a `(date, 0, LEAVE)` day-row and a `(date, 3, PRESENT)` period-row to coexist. Mode changes mid-year are an office-admin action with a documented migration step (not expected in practice).

On approval the `LeaveAttendanceService` (in `packages/business`): (1) loads the student's **current active enrollment** via the repository — if none exists it rejects the approval with a clear error rather than guessing; (2) verifies the approver is the **class teacher of that enrollment's division** (scope check, §4.4); (3) upserts `Attendance` rows as `LEAVE` for each school day in range, each going through the same unique key as manual marking (so leave and a prior "present" mark reconcile instead of duplicating); (4) writes an `AuditLog` row; (5) fires notifications. Cancellation/rejection of a previously-approved leave reverts those `LEAVE` rows. **No schema change was required** — the existing `LeaveApplication.studentId` + `Enrollment` relation is sufficient.

**DoD:** apply → approve → the **current-year enrollment's** attendance shows LEAVE for each school day in range (no duplicate rows); approval by a non-class-teacher is rejected; approval with no current enrollment is rejected with a clear message; push on each transition; every transition audited.

### 8.8 Announcements & messaging
Announcements scoped School/Class/Division. **Authorship (v1.3, B10):** super admin and office admin may publish at any scope; a **class teacher may publish to their own division** (derived from `isClassTeacher`, like leave approval) **[CONFIRM with school]**; other teachers cannot announce. Threaded teacher↔guardian messaging scoped to their students (no open chat); threads are **strictly 1:1** (staff↔guardian — B12). Read receipts.
**DoD:** scoped broadcast reaches only the right recipients; a non-class-teacher cannot create a division announcement; teacher can't message a non-assigned guardian.

### 8.9 Notifications & scheduled sends
In-app + **Expo push** primary; `registerDevice` stores the token, `deregisterDevice` removes it on logout (v1.3, B13); tokens that return `DeviceNotRegistered` in Expo push receipts are pruned by a weekly job. Critical events may also route to SMS/WhatsApp (policy-only channel selection, §4.6). **A scheduled job (Supabase cron)** runs absence-cutoff sends (at `SchoolSettings.absenceCutoffIST`, **skipping non-school days** per §8.19) and fee reminders — idempotent, safe to re-run.
**DoD:** push delivered Android + iOS; absence job sends once per student per day after cutoff and never on a holiday/weekend; logout deregisters the device; centre lists + marks read.

### 8.10 Profiles & portals
Role-aware home per portal (office, teacher, parent w/ **child-switcher**). The student is a *record* the parent views (photo, class, subjects, attendance, marks, timetable) — there is no student login.
**DoD:** each role lands on its dashboard on web + app; parent with 2 children can switch.

### 8.11 i18n
All strings in `en` + `ml`; per-user locale; Malayalam typography verified on both platforms.
**DoD:** switching language updates the whole UI; no hardcoded strings.

### 8.12 Audit log
Immutable log for marks, attendance edits, role/user changes, enrollment/promotion, payments; super-admin viewer with filters.
**DoD:** listed actions produce entries with actor, before/after, timestamp.

### 8.13 Add-on — Online fee collection (`fees`)
Fee structures per class/year; invoices per student; Razorpay order + **HMAC verification** + webhook; receipts (PDF); dues view; reminders; accountant role.
**DoD:** parent pays end-to-end; signature verified server-side; receipt generated; office sees paid/dues. **[CONFIRM fee structure]**

### 8.14 Add-on — WhatsApp alerts (`whatsapp`)
Provider adapter; templated utility messages for absence + key alerts; per-number config.
**DoD:** absence alert delivers to a test number via approved template.

### 8.15 Add-on — Timetable builder (`timetable`)
Visual builder (web): division × day × period → subject/teacher; publish to app; teacher double-booking clash detection.
**DoD:** build + publish a weekly timetable; clashes flagged.

### 8.16 Add-on — Insight dashboards (`analytics`)
Principal charts: attendance trends, grade distribution, class performance over date ranges.
**DoD:** dashboards render from real data, scoped school-wide.

### 8.17 Add-on — Offline attendance (`offline`)
Mobile caches roster; offline marking queued, synced on reconnect; conflict = last-write-wins with audit.
**DoD:** airplane-mode marking persists and syncs on reconnect.

### 8.18 Events / calendar — DECISION: NOT in core
Shown in the original flowchart but **not** in committed scope; **not built** in v1. Announcements cover dated notices. If the client wants a true calendar, it's a new paid add-on. **[CONFIRM only if raised]**

### 8.19 School calendar & typed settings (v1.3 — core, M2)
The **`Holiday`** table + `SchoolSettings.workingWeekdays` are the single source of truth for "is this a school day?", consumed by leave→attendance expansion (§8.7) and the absence job (§8.9). Office admin manages holidays (list/add/remove, optional class-level scope) in web settings; `SchoolSettings` (attendance mode, periods/day, absence cutoff, working weekdays) is a **versioned Zod schema** in `packages/validation`, stored in `School.settings`, read only via one accessor in `packages/business`. This is **not** the declined parent-facing events calendar (§8.18) — it is internal operational data.
**DoD:** marking a date as a holiday prevents absence notifications that day and excludes it from leave expansion; settings validate on write; changing the cutoff changes the job's send time.

---

## 9. Mobile app specifics (Expo)
expo-router; role-based nav after Supabase sign-in. Push via expo-notifications (register on login, clear on logout). TanStack Query persistence for read caches. Offline mutation queue (v1 = attendance only, under `offline`). EAS builds; OTA for JS-only fixes. Bundle Malayalam fonts; verify ml rendering on both platforms.

---

## 10. Non-functional requirements
- **Security:** Supabase Auth (no self-stored passwords); OTP throttling. **Authorization is enforced in the application** — tRPC (coarse role) + business services (fine-grained scope), the single authoritative path (§4.4). **Supabase RLS is defense-in-depth, not the primary mechanism:** Prisma uses a privileged connection and bypasses RLS, so RLS guards Storage objects, signed-URL access, any future direct-Supabase access, and acts as a backstop — it is never the only thing standing between a user and data. Private Storage buckets with short-lived signed URLs minted only after a tRPC authz check; validate upload MIME type + size; Razorpay HMAC verification; no client secrets; service-role key server-only.
- **Privacy (minors / DPDP):** data minimization, no public directory, scoped access, retention + deletion, guardian consent. **[CONFIRM]**
- **Performance:** instant-feel attendance (optimistic UI); list virtualization; PDFs in seconds.
- **Reliability:** daily backups; idempotent webhooks + cron; safe migrations.
- **Accessibility:** large tap targets, high contrast, readable type.
- **Observability:** PostHog, Sentry (web + mobile), structured logs.
- **Time:** IST everywhere; calendar-date fields guarded against UTC drift.

---

## 11. Environments & deployment
- **Envs:** dev, staging, prod (separate Supabase projects).
- **Web + API:** Vercel (Pro). **DB/Auth/Storage:** Supabase. **Mobile:** EAS → Play Store + App Store. **[CONFIRM account ownership]**
- **Env vars:** `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE`, `RAZORPAY_KEY_ID/SECRET`, `MSG91_*`/`GUPSHUP_*`, `RESEND_API_KEY`, `EXPO_*`, `SENTRY_DSN`, `POSTHOG_KEY`.
- **CI (GitHub Actions):** lint → typecheck → test → `prisma validate` → `prisma migrate deploy` → deploy. Block merge on failure.
- **Seed:** one school, super-admin, default SCERT grade scale, current year, feature flags per tier.

---

## 12. Testing & definition of done
Unit tests for `packages/core` (grade calc, attendance %, promotion). Integration tests on key tRPC procedures (authz scope, marks, attendance, fees signature). A feature is **done** only when it works on web **and** app where applicable, authz enforced, audit written where required, strings in en+ml, and §8 criteria pass.

---

## 13. Build order (mapped to payment milestones)

> **Renumbered in v1.3** to match the codebase (the M0 scaffold shipped without auth; auth is M1). Payments stay attached to the **same deliverable content** as the original contract mapping — the deposit gate is still "foundation + auth demonstrated", testing payment is still "full core on staging".

| Milestone | Deliver | Status | Payment |
|---|---|---|---|
| **M0** | Monorepo scaffold, 12 packages, CI, i18n shell, tooling, web+mobile shells | ✅ shipped | |
| **M1** | Schema foundation (School/User/DeviceToken/AuditLog), Supabase Auth + RBAC (Principal, permissions), school setup, feature flags, seed | in progress | **40% deposit** (on M0+M1) |
| **M2** | People + bulk import + academic structure + enrollment + **school calendar & typed settings (§8.19)** | | |
| **M3** | Attendance + push + scheduled absence job | | |
| **M4** | Exams + marks + grades + report-card PDFs + audit viewer | | |
| **M5** | Homework/notes + leave + announcements + messaging | | |
| **M6** | Profiles/portals polish, offline attendance, dashboards, QA on staging | | **30% at testing** |
| **Go-live** | Contracted add-ons (fees + WhatsApp), data import, deploy, app-store submission, training | | **30% on go-live** |

Build add-ons **only** for the contracted tier; leave the rest flagged off.

---

## 14. Deliverables checklist
- [ ] Web admin portal
- [ ] Android app + iOS app (published)
- [ ] Backend + database + deployment
- [ ] Office / teacher / parent portals (no student login — students are records)
- [ ] Authentication (Supabase: OTP + email/password)
- [ ] Bulk import of existing students
- [ ] Report-card PDF generation
- [ ] Contracted add-ons enabled (fees + WhatsApp for Recommended)
- [ ] First-year maintenance handover (runbook, backups, monitoring)

---

## 15. Architecture decision log
1. **Single-tenant, `schoolId` retained.**
2. **Supabase Auth (not custom)** — no self-stored passwords; `User` is a profile keyed to the auth UID.
3. **tRPC over REST** — one typed contract; central authz/audit.
4. **Repositories over raw Prisma in routers.**
5. **Configurable grade scale.**
6. **Enrollment-per-year lifecycle.**
7. **Push-first + scheduled jobs** for absence/reminders.
8. **Feature flags for add-ons.**
9. **IST everywhere** (store UTC, render IST).
10. **No events calendar in core** unless purchased.
11. **Parent-focused; no student login** — students are records, the parent is the family-facing account.
12. **No "Class Teacher" role** — it is a `TEACHER` with `TeacherAssignment.isClassTeacher`; division rights derive from the flag.
13. **Homework is distribution-only** — no submission/review workflow; digital uploads are an optional future add-on.
14. **Authorization is application-enforced; RLS is defense-in-depth** — Prisma's privileged connection bypasses RLS, so tRPC + business services are the authoritative authz path; RLS protects Storage/signed-URLs/direct access (see ADR-002, ADR-003, ADR-004).
15. **`Attendance.period` is non-null (`@default(0)`)** — `0` = whole day, `1..N` = period-wise, so `@@unique([enrollmentId, date, period])` is actually enforced (NULLs are distinct in Postgres unique indexes).
16. **In-domain `*Id` fields are explicit relations** with deliberate `onDelete` rules; only `schoolId`, `AuditLog`/`ImportJob` actor/entity refs, and `Announcement.targetId` (polymorphic) remain intentionally loose.
17. **Notifications sit behind one provider abstraction** (`packages/notifications`); no provider name appears in feature code, OTP provider configured in the same place (see ADR-005).
18. **12-package monorepo** — `business` (use-cases) is separated from `core` (pure domain) and from thin `api` routers; `validation`/`types`/`constants`/`utils` are first-class shared packages.
19. **`ReportCard.examId` is optional** — a card may be exam-bound or (future) consolidated; uniqueness for exam-bound cards is a **partial unique index** (`WHERE examId IS NOT NULL`), avoiding a future migration. The schema models the domain, not the current UI workflow (see ADR-009).
20. **No transport role gate** (v1.3, ADR-002 M1 refinement) — transport authenticates; authorization = permission (`assertCan`) + scope (`assertScope`) in the business layer over a DB-resolved `Principal`.
21. **`Holiday` + typed `SchoolSettings` are the school-day source of truth** (v1.3) — leave expansion and the absence job consume them; settings are a versioned Zod schema, never a free-form Json read.
22. **Calendar-date columns are `@db.Date`** (v1.3) — attendance/exam/leave/year dates are DB-typed IST calendar dates; the UTC off-by-one class of bugs is eliminated at the type level.
23. **Exactly one current `AcademicYear`** (v1.3) — partial unique index `WHERE "isCurrent"`; rollover flips in one transaction.
24. **Storage fields store private-bucket PATHS, never URLs** (v1.3) — `pdfPath`, `attachmentPaths`, `photoPath`, `logoPath`, `filePath`; signed URLs are minted per read after authz (ADR-004).
25. **Notification channels are policy-only in v1** (v1.3) — event→channel matrix + flags; per-user channel prefs are a future add-on.
26. **Leave writes LEAVE in the active attendance-mode encoding** (v1.3) — period 0 in daily mode, all periods in period-wise mode; no mixed-encoding days.

> **Formal ADRs** (Context · Decision · Alternatives · Consequences) live in `docs/architecture/ADR-001..008`. This log is the quick index; the ADR files are the long form.

---

## 16. Open questions — answer before the relevant module
1. Exact **term/exam structure** (terminals, CE components & weightage)?
2. Official **SCERT/DHSE grade bands** to seed?
3. **Rank** shown to students/parents, or hidden?
4. Attendance **daily or period-wise**? Staff attendance in v1?
5. **Fee structure** details — before `fees`.
6. **Existing data** register format for import?
7. **Branding** assets + **domain**?
8. **Apple/Google developer accounts** — school's or vendor's?
9. **Privacy/consent** stance for minors (DPDP)?
10. Final **tier** (which add-on flags ship ON)?
11. **Events calendar** wanted as a paid add-on, or leave out?
12. **Aided vs unaided status** (v1.3): the client brief says *aided*; the school website says "Kerala Government recognised **unaided**". Which is correct? This constrains what the `fees` add-on may collect (unaided = tuition; aided = typically PTA/special fees only) — answer before `fees`.
13. **Gujarati (`gu`) UI locale** (v1.3): the school serves a Gujarati-heritage community. Is a third UI language wanted (paid add-on later)? v1 ships en + ml; the `Locale` enum and catalogs extend cleanly.
14. **Class-teacher division announcements** (v1.3, §8.8): confirm class teachers may publish announcements to their own division.
15. **School-day pattern** (v1.3, §8.19): working weekdays (Mon–Fri or Mon–Sat? alternate Saturdays?) and the standard holiday list for seeding.

---

*Source of truth (v1.3). Keep schema, audit, and lifecycle structures intact; update as §16 answers land. Companion references: `docs/REVIEW_FINDINGS.md` and the planning docs indexed in the README.*
