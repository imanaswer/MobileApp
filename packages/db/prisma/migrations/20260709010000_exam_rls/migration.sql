-- ---------------------------------------------------------------------------
-- M5 Step 4 — Row-Level Security for Examination & Assessment (ADR-012).
--
-- DEFENSE-IN-DEPTH ONLY (ADR-002/012). The AUTHORITATIVE gate is the business
-- layer (assertCan + scope). The app reaches these tables as service_role
-- (BYPASSRLS) via tRPC -> business -> Prisma, so these policies do NOT touch the
-- app path; they only deny/limit DIRECT client-JWT access. Enabling RLS with
-- policies FOR authenticated = deny-all to anon and to any authenticated user
-- matching no policy.
--
-- Rules (Step-4 brief):
--   Admins    (SUPER_ADMIN|OFFICE_ADMIN ACTIVE)  ALL on every table.
--   Teachers  READ + WRITE only the assessments they OWN — ownership is
--             TeacherAssignment(teacher, assessment.subject, examSection.section),
--             i.e. the same subject×section grain as ADR-012 §9. (WRITE policies
--             scope a hypothetical client-JWT write; real writes ride service_role.)
--   Parents   READ published marks for their OWN child only (Exam.isPublished +
--             is_my_child_enrollment). Draft/unpublished results are invisible.
--   Anonymous deny (no policy).
--
-- Reuses is_academic_admin() (academic_rls) and is_my_child_enrollment()
-- (attendance_rls). NOTE (single-tenant, ADR-008): policies do NOT match schoolId;
-- tenant scoping lives in the repository layer.
-- ---------------------------------------------------------------------------

-- ---- scope helpers (SECURITY DEFINER; search_path pinned to '') ----

-- Teacher (auth user) is assigned to teach this subject in ANY section.
CREATE OR REPLACE FUNCTION public.teaches_subject(subj text)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."TeacherAssignment" ta
    WHERE ta."subjectId" = subj
      AND ta."teacherId" = (SELECT auth.uid())::text
  );
$$;

-- Teacher owns an exam via one of its assessments (a subject they teach).
CREATE OR REPLACE FUNCTION public.teaches_exam(ex text)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."Assessment" a
    JOIN public."TeacherAssignment" ta ON ta."subjectId" = a."subjectId"
    WHERE a."examId" = ex
      AND ta."teacherId" = (SELECT auth.uid())::text
  );
$$;

-- Teacher owns this assessment×section register: teaches the assessment's subject
-- IN that section (the exam analog of teaches_session). Takes the ExamSection's own
-- columns so it also gates INSERT (the row need not exist yet).
CREATE OR REPLACE FUNCTION public.teaches_assessment_in_section(assess text, sec text)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."Assessment" a
    JOIN public."TeacherAssignment" ta ON ta."subjectId" = a."subjectId" AND ta."sectionId" = sec
    WHERE a.id = assess
      AND ta."teacherId" = (SELECT auth.uid())::text
  );
$$;

-- Teacher owns the register behind a Mark (resolve subject×section from the ExamSection).
CREATE OR REPLACE FUNCTION public.teaches_exam_section(es text)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."ExamSection" xs
    JOIN public."Assessment" a ON a.id = xs."assessmentId"
    JOIN public."TeacherAssignment" ta ON ta."subjectId" = a."subjectId" AND ta."sectionId" = xs."sectionId"
    WHERE xs.id = es
      AND ta."teacherId" = (SELECT auth.uid())::text
  );
$$;

-- A mark is parent-visible only when its register is LOCKED **and** the owning
-- exam is published (ADR-012 §2 — never a partial/in-flight result; an unlocked
-- correction hides the marks again until re-locked + still-published).
CREATE OR REPLACE FUNCTION public.exam_published_for_section(es text)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."ExamSection" xs
    JOIN public."Assessment" a ON a.id = xs."assessmentId"
    JOIN public."Exam" e ON e.id = a."examId"
    WHERE xs.id = es
      AND xs.status = 'LOCKED'
      AND e."isPublished" = true
  );
$$;

-- The exam is PUBLISHED (parent reads published exam/assessment reference rows).
CREATE OR REPLACE FUNCTION public.is_exam_published(ex text)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public."Exam" e WHERE e.id = ex AND e."isPublished" = true);
$$;

-- ---- Exam: admin ALL; teacher SELECT own; parent SELECT published ----
ALTER TABLE "Exam" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "exam_admin_all" ON "Exam"
  FOR ALL TO authenticated
  USING (public.is_academic_admin()) WITH CHECK (public.is_academic_admin());
CREATE POLICY "teacher_read_exam" ON "Exam"
  FOR SELECT TO authenticated
  USING (public.teaches_exam("id"));
CREATE POLICY "parent_read_published_exam" ON "Exam"
  FOR SELECT TO authenticated
  USING ("isPublished");

-- ---- Assessment: admin ALL; teacher SELECT own-subject; parent SELECT published ----
ALTER TABLE "Assessment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "exam_admin_all" ON "Assessment"
  FOR ALL TO authenticated
  USING (public.is_academic_admin()) WITH CHECK (public.is_academic_admin());
CREATE POLICY "teacher_read_assessment" ON "Assessment"
  FOR SELECT TO authenticated
  USING (public.teaches_subject("subjectId"));
CREATE POLICY "parent_read_published_assessment" ON "Assessment"
  FOR SELECT TO authenticated
  USING (public.is_exam_published("examId"));

-- ---- ExamSection: admin ALL; teacher READ+WRITE own register (no DELETE) ----
ALTER TABLE "ExamSection" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "exam_admin_all" ON "ExamSection"
  FOR ALL TO authenticated
  USING (public.is_academic_admin()) WITH CHECK (public.is_academic_admin());
CREATE POLICY "teacher_read_examsection" ON "ExamSection"
  FOR SELECT TO authenticated
  USING (public.teaches_assessment_in_section("assessmentId", "sectionId"));
CREATE POLICY "teacher_insert_examsection" ON "ExamSection"
  FOR INSERT TO authenticated
  WITH CHECK (public.teaches_assessment_in_section("assessmentId", "sectionId"));
CREATE POLICY "teacher_update_examsection" ON "ExamSection"
  FOR UPDATE TO authenticated
  USING (public.teaches_assessment_in_section("assessmentId", "sectionId"))
  WITH CHECK (public.teaches_assessment_in_section("assessmentId", "sectionId"));

-- ---- Mark: admin ALL; teacher READ+WRITE own register; parent READ published own-child ----
ALTER TABLE "Mark" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "exam_admin_all" ON "Mark"
  FOR ALL TO authenticated
  USING (public.is_academic_admin()) WITH CHECK (public.is_academic_admin());
CREATE POLICY "teacher_read_mark" ON "Mark"
  FOR SELECT TO authenticated
  USING (public.teaches_exam_section("examSectionId"));
CREATE POLICY "teacher_insert_mark" ON "Mark"
  FOR INSERT TO authenticated
  WITH CHECK (public.teaches_exam_section("examSectionId"));
CREATE POLICY "teacher_update_mark" ON "Mark"
  FOR UPDATE TO authenticated
  USING (public.teaches_exam_section("examSectionId"))
  WITH CHECK (public.teaches_exam_section("examSectionId"));
CREATE POLICY "parent_read_published_mark" ON "Mark"
  FOR SELECT TO authenticated
  USING (
    public.is_my_child_enrollment("enrollmentId")
    AND public.exam_published_for_section("examSectionId")
  );

-- ---- GradeScale / GradeBand: admin ALL; read-only reference for any authenticated ----
-- (Grade bands are non-sensitive reference data — teachers and parents both need
--  them to interpret a grade letter/point; writes are admin-only.)
ALTER TABLE "GradeScale" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "exam_admin_all" ON "GradeScale"
  FOR ALL TO authenticated
  USING (public.is_academic_admin()) WITH CHECK (public.is_academic_admin());
CREATE POLICY "read_gradescale" ON "GradeScale"
  FOR SELECT TO authenticated
  USING (true);

ALTER TABLE "GradeBand" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "exam_admin_all" ON "GradeBand"
  FOR ALL TO authenticated
  USING (public.is_academic_admin()) WITH CHECK (public.is_academic_admin());
CREATE POLICY "read_gradeband" ON "GradeBand"
  FOR SELECT TO authenticated
  USING (true);
