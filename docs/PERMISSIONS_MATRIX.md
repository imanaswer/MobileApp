# Permissions Matrix — School Management Portal

The full authorization catalog: every **permission** (`resource:action[:scope]`), which **role** holds it, and which **scope rule** narrows it. Extends Dev PRD §5 and the M1 implementation (`packages/constants/permissions.ts`, `packages/business/authorization.ts`) to all milestones. All formerly-PROPOSED rows were **adopted in Dev PRD v1.3** (see REVIEW_FINDINGS resolution status); rows noting a pending client [CONFIRM] keep that tag until answered.

**Model (ADR-002, M1 refinement):** transport authenticates (`protectedProcedure` → `Principal { userId, schoolId, role, status }` from the DB, never the JWT). The business service then checks **permission** (`assertCan(principal, PERMISSION)`) and **scope** (`assertScope(rule, principal, resourceFacts)`). There is no transport role gate.

## Scope rules (`ScopeRule` predicates)

| Rule | Grants access when… | Facts loaded by service |
|---|---|---|
| `self` | resource is the principal's own account/profile | — |
| `ownDivision` | teacher has a `TeacherAssignment` for the division | assignments |
| `ownSubject` | teacher's assignment covers the `classSubjectId` | assignments |
| `classTeacher` | assignment for the division has `isClassTeacher` | assignments |
| `ownChild` | `GuardianStudent` links guardian → student | guardian links |
| `school` | resource's `schoolId` == principal's (always also enforced by repositories) | — |
| `any` | no narrowing (super admin) | — |

## Core permissions

SA = Super Admin, OA = Office Admin, T = Teacher, P = Parent, AC = Accountant. Cell shows the **scope rule** applied; `–` = not granted.

### Identity & users (M1)

| Permission | SA | OA | T | P | AC |
|---|---|---|---|---|---|
| `profile:read:self` / `profile:update:self` | self | self | self | self | self |
| `user:read` | any | – | – | – | – |
| `user:invite` | any | – | – | – | – |
| `user:set_role` | any | – | – | – | – |
| `user:disable` | any | – | – | – | – |
| `audit:read` | any | – | – | – | – |

### People & import (M2)

| Permission | SA | OA | T | P | AC |
|---|---|---|---|---|---|
| `student:create` / `student:update` / `student:archive` | any | school | – | – | – |
| `student:read` | any | school | ownDivision — **adopted v1.3** (Dev PRD §5 "View student records") | ownChild | – |
| `guardian:create` / `guardian:link` / `guardian:invite` | any | school | – | – | – |
| `staff:create` / `staff:update` / `staff:assign` | any | school | – | – | – |
| `import:run` | any | school | – | – | – |
| `academic:manage` (years, classes, divisions, subjects, mappings, assignments, **holidays, school settings** — v1.3) | any | school | – | – | – |
| `enrollment:enroll` / `enrollment:transfer` / `enrollment:drop` | any | school | – | – | – |
| `enrollment:promote_bulk` | any | – | – | – | – |

### Attendance (M4 — ADR-011)

| Permission | SA | OA | T | P | AC |
|---|---|---|---|---|---|
| `attendance:mark` | any | school | ownDivision | – | – |
| `attendance:read` | any | school | ownDivision | ownChild | – |
| `attendance:correct:submit` | any | school | ownDivision | – | – |
| `attendance:correct:decide` | any | school | classTeacher | – | – |

- Session ownership is **derived from `TeacherAssignment`**, not stored on the session (ADR-011 §3). DAILY = any assignment to the section; SUBJECT = matching `(subject, section)` assignment.
- Note B3: marking + correction actors need a `Staff` row (session `createdBy/submittedBy/lockedBy`, correction `requestedBy/decidedBy` — ADR-011 §4) — provisioning must guarantee one for every SA/OA/T user.
- Holidays are managed under `academic:manage` (working-day calendar, ADR-011 §9).

### Exams & marks (M5, ADR-012 · implemented)

| Permission | SA | OA | T | P | AC |
|---|---|---|---|---|---|
| `exam:manage` (create/update/delete exams + assessments + grade scales; lock/unlock registers; publish) | any | school | – | – | – |
| `marks:enter` (save + submit a register) | any | school | ownSubject×Section (owns via `TeacherAssignment`; register lock is admin-only) | – | – |
| `marks:read` (marks/grades/GPA) | any | school | ownSection | ownChild — **published + LOCKED only** (never a partial/in-flight result) | – |

- Ownership is **derived from `TeacherAssignment(teacher, subject, section)`**, never stored (ADR-012 §9); admins bypass scope. Mark/register actors are a **`Staff` row** (B3 — via `Staff.userId`), same as attendance.
- Two grains: a register **locks** per `ExamSection` (admin), an exam **publishes** per `Exam` (admin) — publish exposes all LOCKED sections at once; grade/percentage is **snapshotted at lock** and GradeScale edits never mutate history.
- OA/SA hold `marks:enter`/`marks:read` school-wide but have no `TeacherAssignment`, so day-to-day entry is teacher-driven (mobile); admins enter/oversee via the web console (find-or-create register).
- **Not built in M5** (later milestones): `reportcard:generate`/`reportcard:read` (report-card PDFs, ADR-009), publish-notify (no notifications in M5), CGPA-across-years.

### Homework, leave, communication (PRD-planned M5 — NOT built)

> Numbering note: this project built **M5 = Examination & Assessment** (above); the
> PRD's homework/communication plan shifts out by one. Tags left as-is pending an
> explicit renumbering decision (see `docs/milestones/M5.md`).


| Permission | SA | OA | T | P | AC |
|---|---|---|---|---|---|
| `homework:create` | any | – | ownDivision (+ownSubject when subject-bound) | – | – |
| `homework:read` | any | school | ownDivision | ownChild | – |
| `leave:apply` | – | – | – | ownChild | – |
| `leave:decide` | any | – | classTeacher | – | – |
| `leave:read` | any | school | classTeacher | ownChild (own applications) | – |
| `announcement:create:school` | any | school | – | – | – |
| `announcement:create:division` | any | school | classTeacher — **adopted v1.3** (Dev PRD §5/§8.8; client [CONFIRM §16.14] pending) | – | – |
| `announcement:read` | any | school | school | school (scoped to child's class/division + school-wide) | school |
| `message:create_thread` | any | – | own students' guardians | – (reply only) | – |
| `message:send` | any | – | own threads | own threads | – |
| `notification:manage_own` (list, markRead, register/deregister device) | self | self | self | self | self |

### Add-ons (feature-flag gated first, then permission)

| Permission | Flag | SA | OA | T | P | AC |
|---|---|---|---|---|---|---|
| `fees:manage` (structures, invoices, reminders) | `fees` | any | – | – | – | school |
| `fees:view` | `fees` | any | school | – | ownChild (own invoices) | school |
| `fees:pay` | `fees` | – | – | – | ownChild | – |
| `timetable:manage` | `timetable` | any | school | – | – | – |
| `timetable:read` | `timetable` | any | school | ownDivision | ownChild | – |
| `analytics:view` | `analytics` | any | – (**decided v1.3**: Dev PRD §8.16 scopes dashboards to the principal; extend to OA later only if asked) | – | – | – |
| `flags:manage` | — | any | – | – | – | – |

## Student document visibility (M3)

RLS decides **who** can reach a student's documents (admin all; teacher = own-section students; parent = own children). The **business layer** (`StudentDocumentService`) then filters **which document types** are returned, by role — RLS is unchanged:

| `StudentDocumentType` | SUPER_ADMIN / OFFICE_ADMIN | TEACHER | PARENT (own child) |
|---|---|---|---|
| `PHOTO` | ✓ | ✓ | ✓ |
| `AADHAAR`, `PASSPORT`, `BIRTH_CERTIFICATE`, `TRANSFER_CERTIFICATE`, `MEDICAL_RECORD`, `OTHER` | ✓ | **hidden** | ✓ |

- Teachers see **only `PHOTO`**; every other type is hidden from teacher-facing APIs (list + get + signed-URL mint).
- **Never expose `MEDICAL_RECORD` to teachers.** If teachers ever need medical info, add a dedicated **Medical Summary** feature — not access to the uploaded files.
- Parents see all types for their **own** children only (RLS already limits reach).

## Enforcement invariants

1. Every add-on procedure checks `FeatureFlag` **before** permission; off → `FORBIDDEN` (ADR-006).
2. Repositories always scope by `schoolId` regardless of role (ADR-003/008) — `school` scope is belt-and-braces.
3. `status === ACTIVE` is enforced per request when the `Principal` is built (disabled users are revoked immediately).
4. Sensitive mutations (marks, attendance, users/roles, enrollment/promotion, money, leave decisions) write `AuditLog` in the same transaction (ADR-007).
5. Storage access is never direct: a tRPC procedure authorizes with this matrix, then mints a short-lived signed URL (ADR-004).
6. Every permission lands in `packages/constants/permissions.ts` in its milestone — this doc and that file must stay in lockstep (review checklist item).
