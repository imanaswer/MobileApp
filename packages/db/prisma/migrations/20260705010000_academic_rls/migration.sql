-- ---------------------------------------------------------------------------
-- M2 Step 3 — Row-Level Security for the academic structure.
--
-- DEFENSE-IN-DEPTH ONLY (ADR-004). The authoritative gate is the business layer
-- (assertCan permission + assertScope). The app never reaches these tables over
-- PostgREST: data access is tRPC -> business -> Prisma, and Prisma connects as
-- service_role (BYPASSRLS), so these policies do NOT touch the app's own path.
-- They exist to deny/limit any DIRECT client-JWT access to the tables.
--
-- Role/status come from the DB `User` row, never the JWT (ADR-002). `User.id`
-- equals the Supabase auth UID, so auth.uid() joins straight to `User`.
--
-- NOTE (single-tenant, ADR-008): policies intentionally do NOT match schoolId —
-- one school today; scoping lives in the repository layer.
-- ---------------------------------------------------------------------------

-- Is the current auth user an ACTIVE academic admin (SUPER_ADMIN | OFFICE_ADMIN)?
-- SECURITY DEFINER so it can read `User` regardless of the caller's grants/RLS;
-- search_path pinned to '' (schema-qualify everything) per Supabase hardening.
CREATE OR REPLACE FUNCTION public.is_academic_admin()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."User" u
    WHERE u.id = (SELECT auth.uid())::text
      AND u.status = 'ACTIVE'
      AND u.role IN ('SUPER_ADMIN', 'OFFICE_ADMIN')
  );
$$;

-- Enabling RLS with no matching policy = deny-all to every non-BYPASSRLS role
-- (anon and unauthorized authenticated users, incl. PARENT). service_role bypasses.

-- AcademicYear / AcademicTerm / Class / Section / Subject: admin-manage only.
ALTER TABLE "AcademicYear" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "academic_admin_all" ON "AcademicYear"
  FOR ALL TO authenticated
  USING (public.is_academic_admin()) WITH CHECK (public.is_academic_admin());

ALTER TABLE "AcademicTerm" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "academic_admin_all" ON "AcademicTerm"
  FOR ALL TO authenticated
  USING (public.is_academic_admin()) WITH CHECK (public.is_academic_admin());

ALTER TABLE "Class" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "academic_admin_all" ON "Class"
  FOR ALL TO authenticated
  USING (public.is_academic_admin()) WITH CHECK (public.is_academic_admin());

ALTER TABLE "Section" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "academic_admin_all" ON "Section"
  FOR ALL TO authenticated
  USING (public.is_academic_admin()) WITH CHECK (public.is_academic_admin());

ALTER TABLE "Subject" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "academic_admin_all" ON "Subject"
  FOR ALL TO authenticated
  USING (public.is_academic_admin()) WITH CHECK (public.is_academic_admin());

-- TeacherAssignment: admins manage; a teacher may READ only their own rows.
ALTER TABLE "TeacherAssignment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "academic_admin_all" ON "TeacherAssignment"
  FOR ALL TO authenticated
  USING (public.is_academic_admin()) WITH CHECK (public.is_academic_admin());
CREATE POLICY "teacher_read_own_assignments" ON "TeacherAssignment"
  FOR SELECT TO authenticated
  USING ("teacherId" = (SELECT auth.uid())::text);
