# Feature — Academic Structure (M2)

Feature-specific rules. References the PRD; does not duplicate it.
Spec: M2 kickoff brief (2026-07-05) · Dev PRD v1.3 §6 · `docs/milestones/M2.md` ·
`docs/RLS_POLICIES.md` · `docs/DATABASE_CONVENTIONS.md`.

## Entities & hierarchy
`AcademicYear → AcademicTerm` (time) and `Class → Section` (structure) with a
school-wide `Subject` catalog. `TeacherAssignment` links **Teacher (User) ×
Subject × Section**. Naming per the kickoff brief: **Class/Section** (older
drafts said ClassLevel/Division). Class/Section/Subject are **structural, not
year-bound** — enrollment binds students to a (year, section) in M3.

## Invariants (DB + business, both layers)
- **One ACTIVE year per school** — partial unique index `AcademicYear(schoolId)
  WHERE status='ACTIVE'` + `findActive` pre-check (`ConflictError`).
- **Terms never overlap** (inclusive boundaries) — Postgres `EXCLUDE USING gist`
  on `daterange(startDate, endDate, '[]')` per year + `findOverlapping` pre-check.
- **start < end** on year and term — `CHECK` constraints + `ValidationError`.
- **Uniques:** year/class/subject name per school; term name per year; section
  name per class; `(teacherId, subjectId, sectionId)` per assignment.
- **Delete guards (Restrict FKs + pre-checks):** class with sections, section or
  subject with assignments → `ConflictError`. Year → terms is Cascade.
- **Assignee rule:** `TeacherAssignment.teacherId` must be an ACTIVE `User` with
  role TEACHER in the caller's school (no Staff table until M3).
- **Assignments are immutable** — create/delete only, no update.
- Every mutation writes `AuditLog` **in the same transaction** (ADR-007).

## Authorization
- Permissions: `academic:manage` (SUPER_ADMIN, OFFICE_ADMIN) · `academic:read`
  (those + TEACHER). Parents/accountants: no academic surface.
- Scope: a TEACHER reads only **their own** assignments (`ownsAssignment`
  ScopeRule; their list is force-scoped server-side regardless of filters).
- RLS (defense-in-depth only — Prisma bypasses): `is_academic_admin()` ALL
  policies on all six tables + `teacher_read_own_assignments` SELECT. See
  `docs/RLS_POLICIES.md`.

## API
Six thin routers on `protectedProcedure`: `academicYear.* / academicTerm.* /
class.* / section.* / subject.* / teacherAssignment.*` — Zod-validate → delegate
to the service (see `docs/API_INVENTORY.md`). `istDateSchema` parses `YYYY-MM-DD`
→ UTC-midnight `Date` for `@db.Date` columns and rejects impossible dates.
Cross-field rules (uniqueness, overlap, start<end) live in services only.

## UI
- **Web (admin CRUD):** `/academic/{years,classes,subjects,assignments}` +
  detail pages `years/[id]` (terms) and `classes/[id]` (sections). Search +
  client-side pagination (bounded lists), create/edit dialogs, destructive
  confirm dialogs. Mutations hidden without `academic:manage`; the section
  layout gates on `academic:read` (UX only — the service is the gate).
- **Mobile (read-only placeholders):** `/academic/{years,classes,subjects,assignments}`
  linked from Home for roles with `academic:read`. No editing UI.
- **Limitation:** assignment forms take the teacher's **user id** — there is no
  user-list API in the M2 surface; a teacher picker arrives with M3 people records.

## Dates
Calendar columns are `@db.Date` (UTC-midnight storage); DTOs expose
`YYYY-MM-DD` IST date strings via the business mappers.

## Tests
Business rules with mocked repositories (`academic.services.test.ts` — 29),
transport gates/Zod/authorization (`packages/api/.../academic.test.ts` — 11),
input schemas (`@repo/validation` — +5). Race-condition backstop is the DB
constraint layer (single-tenant, few admins — accepted in Step 1).
