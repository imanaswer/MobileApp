-- ---------------------------------------------------------------------------
-- M3 Step 4 — Row-Level Security for People Management.
--
-- DEFENSE-IN-DEPTH ONLY (ADR-002/004). The authoritative gate is the business
-- layer (assertCan + assertScope). The app reaches these tables as service_role
-- (BYPASSRLS) via tRPC -> business -> Prisma, so these policies do NOT touch the
-- app path; they only deny/limit DIRECT client-JWT access.
--
-- Role/status come from the DB `User` row, never the JWT (ADR-002). Reuses
-- is_academic_admin() from academic_rls — SUPER_ADMIN | OFFICE_ADMIN (ACTIVE) is
-- exactly M3's "full management" set.
--
-- NOTE (single-tenant, ADR-008): policies do NOT match schoolId; one school
-- today, scoping lives in the repository layer.
-- ---------------------------------------------------------------------------

-- ---- scope helpers (SECURITY DEFINER so they read regardless of caller grants;
--      search_path pinned to '' per Supabase hardening) ----

-- Parent (auth user) is linked to this student via StudentParent.
CREATE OR REPLACE FUNCTION public.is_my_child(child text)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."StudentParent" sp
    JOIN public."Parent" p ON p.id = sp."parentId"
    WHERE sp."studentId" = child
      AND p."userId" = (SELECT auth.uid())::text
  );
$$;

-- Auth user owns this Parent record.
CREATE OR REPLACE FUNCTION public.is_my_parent_record(pid text)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."Parent" p
    WHERE p.id = pid AND p."userId" = (SELECT auth.uid())::text
  );
$$;

-- Teacher (auth user) teaches this section (via TeacherAssignment).
CREATE OR REPLACE FUNCTION public.teaches_section(sec text)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."TeacherAssignment" ta
    WHERE ta."sectionId" = sec
      AND ta."teacherId" = (SELECT auth.uid())::text
  );
$$;

-- Teacher teaches a section this student is enrolled in. Coarse on purpose (any
-- year); the business layer narrows to the ACTIVE year. A null-section
-- enrollment joins to nothing, so unplaced students are not teacher-visible.
CREATE OR REPLACE FUNCTION public.teaches_student(stu text)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."Enrollment" e
    JOIN public."TeacherAssignment" ta ON ta."sectionId" = e."sectionId"
    WHERE e."studentId" = stu
      AND ta."teacherId" = (SELECT auth.uid())::text
  );
$$;

-- Enabling RLS with policies only FOR authenticated = deny-all to anon and to any
-- authenticated user who matches no policy. service_role (app path) bypasses.

-- ---- Student: admin ALL; teacher & parent SELECT in scope ----
ALTER TABLE "Student" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "people_admin_all" ON "Student"
  FOR ALL TO authenticated
  USING (public.is_academic_admin()) WITH CHECK (public.is_academic_admin());
CREATE POLICY "teacher_read_students" ON "Student"
  FOR SELECT TO authenticated
  USING (public.teaches_student("id"));
CREATE POLICY "parent_read_children" ON "Student"
  FOR SELECT TO authenticated
  USING (public.is_my_child("id"));

-- ---- StudentDocument: mirrors Student visibility ----
ALTER TABLE "StudentDocument" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "people_admin_all" ON "StudentDocument"
  FOR ALL TO authenticated
  USING (public.is_academic_admin()) WITH CHECK (public.is_academic_admin());
CREATE POLICY "teacher_read_docs" ON "StudentDocument"
  FOR SELECT TO authenticated
  USING (public.teaches_student("studentId"));
CREATE POLICY "parent_read_docs" ON "StudentDocument"
  FOR SELECT TO authenticated
  USING (public.is_my_child("studentId"));

-- ---- Enrollment: admin ALL; teacher own-section; parent own-child ----
ALTER TABLE "Enrollment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "people_admin_all" ON "Enrollment"
  FOR ALL TO authenticated
  USING (public.is_academic_admin()) WITH CHECK (public.is_academic_admin());
CREATE POLICY "teacher_read_enrollments" ON "Enrollment"
  FOR SELECT TO authenticated
  USING (public.teaches_section("sectionId"));
CREATE POLICY "parent_read_enrollments" ON "Enrollment"
  FOR SELECT TO authenticated
  USING (public.is_my_child("studentId"));

-- ---- Parent: admin ALL; a parent reads only their own record ----
ALTER TABLE "Parent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "people_admin_all" ON "Parent"
  FOR ALL TO authenticated
  USING (public.is_academic_admin()) WITH CHECK (public.is_academic_admin());
CREATE POLICY "parent_read_self" ON "Parent"
  FOR SELECT TO authenticated
  USING ("userId" = (SELECT auth.uid())::text);

-- ---- StudentParent: admin ALL; a parent reads their own links ----
ALTER TABLE "StudentParent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "people_admin_all" ON "StudentParent"
  FOR ALL TO authenticated
  USING (public.is_academic_admin()) WITH CHECK (public.is_academic_admin());
CREATE POLICY "parent_read_own_links" ON "StudentParent"
  FOR SELECT TO authenticated
  USING (public.is_my_parent_record("parentId"));

-- ---- Staff: admin ALL; staff reads only their own profile ----
ALTER TABLE "Staff" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "people_admin_all" ON "Staff"
  FOR ALL TO authenticated
  USING (public.is_academic_admin()) WITH CHECK (public.is_academic_admin());
CREATE POLICY "staff_read_self" ON "Staff"
  FOR SELECT TO authenticated
  USING ("userId" = (SELECT auth.uid())::text);
