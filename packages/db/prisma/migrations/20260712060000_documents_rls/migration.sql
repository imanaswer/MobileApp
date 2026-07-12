-- ---------------------------------------------------------------------------
-- M15 Step 3 — Row-Level Security for Documents & Certificates (ADR-023 §9).
--
-- DEFENSE-IN-DEPTH ONLY (ADR-002/023). The authoritative gate is the business
-- layer (assertCan(document:*) + row scope + the APPROVED-only status filter for
-- non-admins). The app reaches these tables as service_role (BYPASSRLS) via
-- tRPC -> business -> Prisma, so these policies do NOT touch the app path — they
-- only deny/limit DIRECT client-JWT access.
--
-- Reuses the M3 people_rls helpers VERBATIM — is_academic_admin()
-- (SUPER_ADMIN|OFFICE_ADMIN ACTIVE), teaches_student(studentId) (teacher's
-- own-section students, via Enrollment→TeacherAssignment), is_my_child(studentId)
-- (parent's own children, via StudentParent→Parent). NO new helper. Document is
-- student-keyed exactly like its M3 sibling StudentDocument, so it inherits the
-- same who-can-reach-a-student's-docs predicates. Role/status come from the DB
-- `User` row; auth.uid() == User.id.
--
-- NOTE (single-tenant, ADR-008): policies do NOT match schoolId; tenant scoping
-- lives in the repository layer.
--
-- Model (ADR-023 §9):
--   • Document — admin ALL; TEACHER SELECTs own-section students' docs
--     (teaches_student — read-only; no write policy → "Teacher view only", and
--     "Teacher A ≠ Teacher B's other section"); PARENT SELECTs own child's docs
--     (is_my_child — "Parent ≠ other parent"). The APPROVED-only narrowing for
--     teacher/parent is a BUSINESS filter (RLS is coarser, belt-and-braces).
--     Writes (generate/upload/approve/archive/delete) run as service_role.
--   • DocumentTemplate — admin ALL only. Templates are admin metadata, not
--     per-student data; teachers/parents never read them directly (they reach
--     documents through Document). The FeeStructure precedent (admin-ALL coarse).
--   • Anon: no policy = denied everywhere.
--
-- Purely additive: enables RLS + policies on the two M15 tables only.
-- ---------------------------------------------------------------------------

-- ---- DocumentTemplate: admin ALL (templates are admin metadata) ----
ALTER TABLE "DocumentTemplate" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "document_template_admin_all" ON "DocumentTemplate"
  FOR ALL TO authenticated
  USING (public.is_academic_admin()) WITH CHECK (public.is_academic_admin());

-- ---- Document: admin ALL; teacher own-section read; parent own-child read ----
ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "document_admin_all" ON "Document"
  FOR ALL TO authenticated
  USING (public.is_academic_admin()) WITH CHECK (public.is_academic_admin());
CREATE POLICY "teacher_read_section_documents" ON "Document"
  FOR SELECT TO authenticated
  USING (public.teaches_student("studentId"));
CREATE POLICY "parent_read_child_documents" ON "Document"
  FOR SELECT TO authenticated
  USING (public.is_my_child("studentId"));
