# RLS Policies

Row-Level Security is **defense-in-depth only** (ADR-004). The authoritative
authorization gate is the **business layer** (`assertCan` permission +
`assertScope`). The app reaches these tables via tRPC → business → Prisma, and
**Prisma connects as `service_role` (BYPASSRLS)** — so these policies never touch
the app's own data path. They exist to deny/limit any **direct client-JWT access**
(PostgREST / a leaked Supabase token). Role/status come from the DB `User` row,
never the JWT (ADR-002); `User.id == auth.uid()`.

RLS is a filter **on top of GRANTs** — it never grants. A policy is only "live"
for a role that also holds the table privilege. See _Verification_ below.

## Helper

`public.is_academic_admin() → boolean` — `EXISTS` an **ACTIVE** `User` whose
`id = auth.uid()` and `role IN (SUPER_ADMIN, OFFICE_ADMIN)`. `SECURITY DEFINER`
(reads `User` regardless of caller grants/RLS) with `search_path = ''` pinned.

## Policies (migration `20260705010000_academic_rls`)

| Table | Policy | Cmd | Role | Rule |
|---|---|---|---|---|
| AcademicYear | `academic_admin_all` | ALL | authenticated | `is_academic_admin()` (USING + WITH CHECK) |
| AcademicTerm | `academic_admin_all` | ALL | authenticated | same |
| Class | `academic_admin_all` | ALL | authenticated | same |
| Section | `academic_admin_all` | ALL | authenticated | same |
| Subject | `academic_admin_all` | ALL | authenticated | same |
| TeacherAssignment | `academic_admin_all` | ALL | authenticated | `is_academic_admin()` |
| TeacherAssignment | `teacher_read_own_assignments` | SELECT | authenticated | `teacherId = auth.uid()` |

**Deny-by-default:** RLS is `ENABLE`d (not `FORCE` — `service_role` must keep
bypassing) with no other policy, so `anon` and any authenticated user who is
neither an academic admin nor the owning teacher (incl. **PARENT**) match no
policy → **denied**. Single-tenant: policies intentionally omit `schoolId`
(ADR-008); tenant scoping lives in the repository layer.

## Verification status

- **Structural:** `prisma validate` passes; SQL reviewed. ✅
- **Unverified (needs live DB):** run `\dp "AcademicYear"` (and one M1 table) to
  confirm `authenticated`/`anon` GRANTs — this tells us whether the policies are
  a live control or purely intent-mirroring, and whether direct reads are denied.
  No live DB creds in the dev env (same as M1); apply + probe during provisioning.

## M4 attendance tables (migration `20260707000000_attendance_rls`)

Same posture as M3 people_rls: admin `ALL`, teacher/parent **SELECT-only** in
scope (client-JWT writes denied everywhere; writes go via `service_role` after
business checks). New `SECURITY DEFINER` helpers (`search_path=''`):
`teaches_session(sid)`, `teaches_enrollment(eid)`, `teaches_record(rid)`
(teacher scope via TeacherAssignment), `enrollment_is_my_child(eid)`,
`session_has_my_child(sid)` (parent scope via StudentParent). Reuses
`is_academic_admin()`, `teaches_section()`, `is_my_parent_record()`.

| Table | Policy | Cmd | Role | Rule |
|---|---|---|---|---|
| AttendanceSession | `attendance_admin_all` | ALL | authenticated | `is_academic_admin()` (USING + WITH CHECK) |
| AttendanceSession | `teacher_read_sessions` | SELECT | authenticated | `teaches_section(sectionId)` |
| AttendanceSession | `parent_read_sessions` | SELECT | authenticated | `session_has_my_child(id)` — only sessions containing their child |
| AttendanceRecord | `attendance_admin_all` | ALL | authenticated | `is_academic_admin()` |
| AttendanceRecord | `teacher_read_records` | SELECT | authenticated | `teaches_session(sessionId)` |
| AttendanceRecord | `parent_read_records` | SELECT | authenticated | `enrollment_is_my_child(enrollmentId)` |
| LeaveRequest | `attendance_admin_all` | ALL | authenticated | `is_academic_admin()` |
| LeaveRequest | `parent_read_own_leaves` | SELECT | authenticated | `is_my_parent_record(parentId)` |
| LeaveRequest | `teacher_read_section_leaves` | SELECT | authenticated | `teaches_enrollment(enrollmentId)` |
| AttendanceCorrection | `attendance_admin_all` | ALL | authenticated | `is_academic_admin()` |
| AttendanceCorrection | `requester_read_own_corrections` | SELECT | authenticated | `requestedByUserId = auth.uid()` |
| AttendanceCorrection | `teacher_read_section_corrections` | SELECT | authenticated | `teaches_record(attendanceRecordId)` |
| Holiday | `attendance_admin_all` | ALL | authenticated | `is_academic_admin()` |
| Holiday | `authenticated_read_holidays` | SELECT | authenticated | `true` — non-sensitive calendar every portal renders |

**Effect:** a parent cannot see another child's records, any correction, or
another family's leave; a teacher sees only sessions/records/leaves/corrections
of sections they teach; `anon` matches no policy → denied everywhere;
`service_role` (app path) bypasses. Live-DB verification is the same pending
gate as below (apply + probe during provisioning).

## M1 auth tables (migration `20260705020000_m1_rls_hardening`)

Security-fix hardening: M1 shipped `School`/`User`/`DeviceToken`/`AuditLog` with
**no RLS**. Enabled RLS (`ENABLE`, not FORCE) with read-only policies; **no write
policies** → all writes denied for `authenticated`/`anon` (writes go via
`service_role`). Helper `public.is_admin()` (SECURITY DEFINER, `search_path=''`)
resolves SUPER_ADMIN/OFFICE_ADMIN-active from the DB `User` row.

| Table | Policy | Cmd | Role | Rule |
|---|---|---|---|---|
| School | `school_admin_read` | SELECT | authenticated | `is_admin()` |
| User | `user_read_self` | SELECT | authenticated | `id = auth.uid()` |
| User | `user_admin_read_all` | SELECT | authenticated | `is_admin()` |
| DeviceToken | `device_token_owner_read` | SELECT | authenticated | `userId = auth.uid()` |
| AuditLog | `audit_log_admin_read` | SELECT | authenticated | `is_admin()` |

**Effect:** a parent/teacher can read only their own `User` row (+ own device
tokens) — **no enumeration** of other users; `anon` matches no policy → denied
everywhere; `service_role` bypasses so the app is unaffected. No `Guardian` table
exists yet (later milestone). Verified no source-level Supabase-client `.from(...)`
read of these tables, so admin-only `School`/`AuditLog` reads break nothing.

### ⚠️ Blocking pre-apply gate (live DB)

Enabling RLS on **`User` is load-bearing for all auth** — every request loads the
Principal by reading `User` via Prisma. This is safe **only if** Prisma's live
connection role owns the tables **or** has `BYPASSRLS` (owner is exempt while
FORCE is off). If it does not, enabling RLS on `User` returns zero rows to Prisma
→ **full auth lockout**. The dev-env connection string uses a placeholder role;
the live role is unverified here. **Before applying this migration to any live DB,
confirm** the Prisma role bypasses RLS (`SELECT rolbypassrls FROM pg_roles WHERE
rolname = current_user;` on that connection, or that it owns `public."User"`).
Also run `\dp "User"` to confirm the `authenticated` GRANT that made these
policies necessary. Structurally verified (`prisma validate`); the three live
checks (service_role works / anon denied / authenticated cannot enumerate) are
**pending live verification**.
