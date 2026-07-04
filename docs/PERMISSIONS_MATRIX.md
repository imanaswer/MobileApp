# Permissions Matrix — School Management Portal

The full authorization catalog: every **permission** (`resource:action[:scope]`), which **role** holds it, and which **scope rule** narrows it. Extends Dev PRD §5 and the M1 implementation (`packages/constants/permissions.ts`, `packages/business/authorization.ts`) to all milestones. Rows marked **PROPOSED** fill gaps the PRD left implicit (see REVIEW_FINDINGS B10/B11) — confirm before that module's milestone.

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
| `student:read` | any | school | ownDivision **PROPOSED** (B11 — roster access is required for attendance/marks) | ownChild | – |
| `guardian:create` / `guardian:link` / `guardian:invite` | any | school | – | – | – |
| `staff:create` / `staff:update` / `staff:assign` | any | school | – | – | – |
| `import:run` | any | school | – | – | – |
| `academic:manage` (years, classes, divisions, subjects, mappings, assignments) | any | school | – | – | – |
| `enrollment:enroll` / `enrollment:transfer` / `enrollment:drop` | any | school | – | – | – |
| `enrollment:promote_bulk` | any | – | – | – | – |

### Attendance (M3)

| Permission | SA | OA | T | P | AC |
|---|---|---|---|---|---|
| `attendance:mark` | any | school | ownDivision | – | – |
| `attendance:read` | any | school | ownDivision | ownChild | – |

Note B3: marking requires the actor to have a `Staff` row (`markedByStaffId`) — provisioning must guarantee one for every SA/OA/T user.

### Exams & marks (M4)

| Permission | SA | OA | T | P | AC |
|---|---|---|---|---|---|
| `exam:manage` (create exam, define subjects, grade scales) | any | school **PROPOSED** (matrix says "manage academic structure ✓" — confirm exams included) | – | – | – |
| `marks:enter` | any | – | ownSubject | – | – |
| `marks:read` | any | school | ownDivision | ownChild | – |
| `reportcard:generate` | any | school | classTeacher **PROPOSED** | – | – |
| `reportcard:read` | any | school | ownDivision | ownChild | – |

### Homework, leave, communication (M5)

| Permission | SA | OA | T | P | AC |
|---|---|---|---|---|---|
| `homework:create` | any | – | ownDivision (+ownSubject when subject-bound) | – | – |
| `homework:read` | any | school | ownDivision | ownChild | – |
| `leave:apply` | – | – | – | ownChild | – |
| `leave:decide` | any | – | classTeacher | – | – |
| `leave:read` | any | school | classTeacher | ownChild (own applications) | – |
| `announcement:create:school` | any | school | – | – | – |
| `announcement:create:division` | any | school | classTeacher **PROPOSED** (B10 — [CONFIRM]) | – | – |
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
| `analytics:view` | `analytics` | any | school **PROPOSED** | – | – | – |
| `flags:manage` | — | any | – | – | – | – |

## Enforcement invariants

1. Every add-on procedure checks `FeatureFlag` **before** permission; off → `FORBIDDEN` (ADR-006).
2. Repositories always scope by `schoolId` regardless of role (ADR-003/008) — `school` scope is belt-and-braces.
3. `status === ACTIVE` is enforced per request when the `Principal` is built (disabled users are revoked immediately).
4. Sensitive mutations (marks, attendance, users/roles, enrollment/promotion, money, leave decisions) write `AuditLog` in the same transaction (ADR-007).
5. Storage access is never direct: a tRPC procedure authorizes with this matrix, then mints a short-lived signed URL (ADR-004).
6. Every permission lands in `packages/constants/permissions.ts` in its milestone — this doc and that file must stay in lockstep (review checklist item).
