# Feature — People Management (M3)

Feature-specific rules. References the PRD; does not duplicate it.
Spec: M3 kickoff brief (2026-07-05) · ADR-010 (enrollment model) · ADR-004
(document storage) · Dev PRD v1.3 §6, §8.2 · `docs/milestones/M3.md` ·
`docs/PERMISSIONS_MATRIX.md` · `docs/RLS_POLICIES.md`.

## Entities & ownership (ADR-010)

`Student` is **identity only** (admission no, names, dob, gender, blood group,
nationality, Aadhaar/passport, address, photo path, person-level status) —
never class/section/year. `Enrollment` owns per-year placement: **(student,
academic year) unique**, holding class, optional section, optional roll number,
and a placement status (`ADMITTED → ACTIVE → PROMOTED/RETAINED/TRANSFERRED/
DROPPED/ALUMNI`). `Parent ↔ Student` is many-to-many through `StudentParent`
with a relationship enum (FATHER/MOTHER/GUARDIAN/EMERGENCY_CONTACT) in the PK —
one person can hold different relationships to different children. `Staff`
extends `User` 1:1 (employment profile only; credentials/role stay on the
frozen User). `StudentDocument` is metadata over private-bucket files.

## Invariants (DB + business, both layers)

- **Admission number unique per school**; **Aadhaar unique per school when
  present** (partial unique).
- **One enrollment per student per academic year** (unique) — promotion/next
  year = a NEW enrollment; **historical enrollments are never mutated**.
- **Section transfer (same class) mutates the SAME row in place** (ADR-010 §5);
  promotion re-points nothing — the source row is closed as PROMOTED/RETAINED.
- **Roll numbers**: only with a section (`CHECK`), unique per (year, section)
  (partial unique), cleared on transfer unless re-assigned.
- Enrolling requires an **ACTIVE student**; withdraw dual-writes (enrollment →
  DROPPED, student → WITHDRAWN) in one transaction with two audit rows.
- **At most one primary contact per student** (partial unique + `clearPrimary`
  in the link transaction); duplicate `(student, parent, relationship)` → 409.
- `Staff.employeeId` unique per school; one profile per user.
- Delete behavior: student → enrollments **Restrict** (archive instead);
  documents/links **Cascade**; `Parent.userId` **SetNull** (removing a login
  keeps the contact record).
- Every administrative mutation writes `AuditLog` **in the same transaction**.

## Authorization (permission + ROW scope, business layer)

- `student/enrollment/parent/staff/student_document` each split `:read` /
  `:manage`. SUPER_ADMIN + OFFICE_ADMIN hold all; TEACHER holds student/
  enrollment/document/staff **read**; PARENT holds student/enrollment/document/
  parent **read**; ACCOUNTANT none.
- Row scope narrows reads in the service: TEACHER → students enrolled in
  sections they teach (ACTIVE year, via TeacherAssignment); PARENT → own
  children (via StudentParent) and own parent record; TEACHER → own staff
  profile. Admins are school-wide.
- **Document type visibility**: TEACHER sees ONLY `PHOTO` (single source of
  truth `TEACHER_VISIBLE_TYPES` in the document service — never expose
  MEDICAL_RECORD/AADHAAR to teachers); admins and the child's own parent see
  all types. Enforced on list, get, AND the signed-URL mint path.
- RLS (defense-in-depth only — Prisma bypasses): admin ALL on all five tables;
  teacher own-section SELECT on Student/Enrollment/StudentDocument; parent
  own-child SELECT; parent/staff self-SELECT on Parent/Staff. Anon: nothing.

## Documents & storage (ADR-004)

Bytes live in the **private** `student-documents` bucket (provisioning:
`RUNBOOK_SUPABASE_SETUP.md` §3b); the DB stores metadata + `storagePath` only.
The business layer defines a framework-free `StoragePort`; the web host
implements it with the service-role key (`apps/web/src/lib/storage.ts`) and
injects it into the tRPC context (`storageProcedure`). Upload: mint a one-time
signed upload URL with a **server-chosen** `schoolId/studentId/uuid-name` path
→ browser `uploadToSignedUrl` → persist metadata (replace bumps `version`).
Read: 300 s signed URL minted only AFTER permission + tenant + row scope + type
visibility pass. Clients never touch the bucket with their own credentials.

## API

Five thin routers on `protectedProcedure`: `student.* / parent.* /
teacherProfile.* / enrollment.* / studentDocument.*` (see `API_INVENTORY.md`).
Zod inputs in `@repo/validation` (shape only — cross-entity rules stay in
services); `studentDocument.uploadUrl/downloadUrl` additionally require the
host `StoragePort` (`PRECONDITION_FAILED` without it).

## UI

- **Web (full CRUD):** `/people/{students,parents,teacher-profiles}` +
  `students/[id]` detail hosting the three ownership panels — enrollment
  lifecycle (enroll/transfer/promote/withdraw), guardian links, documents
  (upload/replace/view/delete). Tabs and mutation UI are permission-filtered
  (UX only — services are the gate). Staff creation takes a user id (no
  user-directory API yet — same M2 limitation).
- **Mobile (read-only):** `/people/{students,parents,teacher-profiles}` +
  `students/[id]` profile (identity, enrollment history, guardians), linked
  from Home per permission. No editing UI. Name lookups (year/class/section,
  parent) run only for roles holding the matching read permission and fall
  back to raw ids (e.g. a parent lacks `academic:read`).

## Tests

Business rules with mocked repositories (`people.services.test.ts` — 53:
identity uniqueness, row scopes, full ADR-010 lifecycle, guardian links, staff
uniqueness, document visibility + mint-path authz), transport gates/Zod/storage
gate (`packages/api/.../people.test.ts` — 15), input schemas
(`@repo/validation/people.test.ts` — 9). DB constraints are the race backstop.
