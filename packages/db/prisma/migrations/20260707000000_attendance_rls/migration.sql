-- ---------------------------------------------------------------------------
-- M4 Step 4 — Row-Level Security for Attendance Management.
--
-- DEFENSE-IN-DEPTH ONLY (ADR-002/004). The authoritative gate is the business
-- layer (assertCan + assertScope). The app reaches these tables as service_role
-- (BYPASSRLS) via tRPC -> business -> Prisma, so these policies do NOT touch the
-- app path; they only deny/limit DIRECT client-JWT access.
--
-- Role/status come from the DB `User` row, never the JWT (ADR-002). Reuses
-- is_academic_admin() (academic_rls), teaches_section() and
-- is_my_parent_record() (people_rls). SUPER_ADMIN | OFFICE_ADMIN (ACTIVE) is
-- exactly M4's "full management" set. Teacher/parent policies are SELECT-only,
-- the same M3 posture: client-JWT writes are denied everywhere (all writes go
-- via service_role after business-layer checks).
--
-- NOTE (single-tenant, ADR-008): policies do NOT match schoolId; one school
-- today, scoping lives in the repository layer.
-- ---------------------------------------------------------------------------

-- ---- scope helpers (SECURITY DEFINER so they read regardless of caller grants;
--      search_path pinned to '' per Supabase hardening) ----

-- Teacher (auth user) teaches the section of this session.
CREATE OR REPLACE FUNCTION public.teaches_session(sid text)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."AttendanceSession" s
    JOIN public."TeacherAssignment" ta ON ta."sectionId" = s."sectionId"
    WHERE s.id = sid
      AND ta."teacherId" = (SELECT auth.uid())::text
  );
$$;

-- Teacher teaches the section of this enrollment (leave requests are
-- enrollment-keyed). A null-section enrollment joins to nothing.
CREATE OR REPLACE FUNCTION public.teaches_enrollment(eid text)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."Enrollment" e
    JOIN public."TeacherAssignment" ta ON ta."sectionId" = e."sectionId"
    WHERE e.id = eid
      AND ta."teacherId" = (SELECT auth.uid())::text
  );
$$;

-- Teacher teaches the section of the session this record belongs to.
CREATE OR REPLACE FUNCTION public.teaches_record(rid text)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."AttendanceRecord" r
    JOIN public."AttendanceSession" s ON s.id = r."sessionId"
    JOIN public."TeacherAssignment" ta ON ta."sectionId" = s."sectionId"
    WHERE r.id = rid
      AND ta."teacherId" = (SELECT auth.uid())::text
  );
$$;

-- Parent (auth user) is linked to the student of this enrollment.
CREATE OR REPLACE FUNCTION public.enrollment_is_my_child(eid text)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."Enrollment" e
    JOIN public."StudentParent" sp ON sp."studentId" = e."studentId"
    JOIN public."Parent" p ON p.id = sp."parentId"
    WHERE e.id = eid
      AND p."userId" = (SELECT auth.uid())::text
  );
$$;

-- A record in this session belongs to a child of the auth user (parents see a
-- session only through their child's presence in it — date/type context for
-- the calendar view, no roster enumeration of sessions their child is not in).
CREATE OR REPLACE FUNCTION public.session_has_my_child(sid text)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."AttendanceRecord" r
    JOIN public."Enrollment" e ON e.id = r."enrollmentId"
    JOIN public."StudentParent" sp ON sp."studentId" = e."studentId"
    JOIN public."Parent" p ON p.id = sp."parentId"
    WHERE r."sessionId" = sid
      AND p."userId" = (SELECT auth.uid())::text
  );
$$;

-- Enabling RLS with policies only FOR authenticated = deny-all to anon and to
-- any authenticated user who matches no policy. service_role (app path) bypasses.

-- ---- AttendanceSession: admin ALL; teacher own-section; parent via child ----
ALTER TABLE "AttendanceSession" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attendance_admin_all" ON "AttendanceSession"
  FOR ALL TO authenticated
  USING (public.is_academic_admin()) WITH CHECK (public.is_academic_admin());
CREATE POLICY "teacher_read_sessions" ON "AttendanceSession"
  FOR SELECT TO authenticated
  USING (public.teaches_section("sectionId"));
CREATE POLICY "parent_read_sessions" ON "AttendanceSession"
  FOR SELECT TO authenticated
  USING (public.session_has_my_child("id"));

-- ---- AttendanceRecord: admin ALL; teacher via session's section; parent own-child ----
ALTER TABLE "AttendanceRecord" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attendance_admin_all" ON "AttendanceRecord"
  FOR ALL TO authenticated
  USING (public.is_academic_admin()) WITH CHECK (public.is_academic_admin());
CREATE POLICY "teacher_read_records" ON "AttendanceRecord"
  FOR SELECT TO authenticated
  USING (public.teaches_session("sessionId"));
CREATE POLICY "parent_read_records" ON "AttendanceRecord"
  FOR SELECT TO authenticated
  USING (public.enrollment_is_my_child("enrollmentId"));

-- ---- LeaveRequest: admin ALL; parent own rows; teacher own-section read ----
ALTER TABLE "LeaveRequest" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attendance_admin_all" ON "LeaveRequest"
  FOR ALL TO authenticated
  USING (public.is_academic_admin()) WITH CHECK (public.is_academic_admin());
CREATE POLICY "parent_read_own_leaves" ON "LeaveRequest"
  FOR SELECT TO authenticated
  USING (public.is_my_parent_record("parentId"));
CREATE POLICY "teacher_read_section_leaves" ON "LeaveRequest"
  FOR SELECT TO authenticated
  USING (public.teaches_enrollment("enrollmentId"));

-- ---- AttendanceCorrection: admin ALL; requester own rows; teacher own-section ----
ALTER TABLE "AttendanceCorrection" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attendance_admin_all" ON "AttendanceCorrection"
  FOR ALL TO authenticated
  USING (public.is_academic_admin()) WITH CHECK (public.is_academic_admin());
CREATE POLICY "requester_read_own_corrections" ON "AttendanceCorrection"
  FOR SELECT TO authenticated
  USING ("requestedByUserId" = (SELECT auth.uid())::text);
CREATE POLICY "teacher_read_section_corrections" ON "AttendanceCorrection"
  FOR SELECT TO authenticated
  USING (public.teaches_record("attendanceRecordId"));

-- ---- Holiday: admin ALL; any authenticated user may read (non-sensitive
--      calendar data every portal renders; anon still matches no policy) ----
ALTER TABLE "Holiday" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attendance_admin_all" ON "Holiday"
  FOR ALL TO authenticated
  USING (public.is_academic_admin()) WITH CHECK (public.is_academic_admin());
CREATE POLICY "authenticated_read_holidays" ON "Holiday"
  FOR SELECT TO authenticated
  USING (true);
