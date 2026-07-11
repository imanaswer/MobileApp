-- ---------------------------------------------------------------------------
-- M11 Step 3 — Row-Level Security for Announcements & Calendar (ADR-019 §6).
--
-- DEFENSE-IN-DEPTH ONLY (ADR-002). The authoritative gate is the business layer
-- (assertCan + scope). The app reaches these tables as service_role (BYPASSRLS):
-- tRPC → business → Prisma, so these policies do NOT touch the app's own path —
-- they only limit DIRECT client-JWT access. Reuses is_academic_admin()
-- (academic_rls). Role/status come from the DB `User` row, never the JWT.
--
-- NOTE (single-tenant, ADR-008): policies do NOT match schoolId; tenant scoping
-- lives in the repository layer.
--
-- COARSE by design (ADR-019 §6): there is NO AnnouncementRecipient table (unlike
-- M10), so per-user "visible if targeted" is resolved in the BUSINESS layer, not
-- RLS. RLS here only enforces the status/role floor:
--   • Announcement           — admin ALL; authenticated SELECT PUBLISHED only
--                              (drafts are admin/author-only, read via the service).
--                              Anon: no policy = denied.
--   • AnnouncementAttachment — admin ALL; authenticated SELECT iff its parent
--                              Announcement is PUBLISHED (EXISTS). Anon: denied.
--   • SchoolCalendarEvent    — admin ALL; authenticated SELECT (read-only
--                              reference — the calendar is not per-user). Anon: denied.
-- No table is client-written (INSERT/UPDATE/DELETE only via service_role); the only
-- write policy is admin-ALL, mirroring M10. Purely additive: enables RLS + policies
-- on the three M11 tables; no frozen policy altered; no new helper.
-- ---------------------------------------------------------------------------

-- ---- Announcement: admin ALL; authenticated reads PUBLISHED only ----
ALTER TABLE "Announcement" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "announcement_admin_all" ON "Announcement"
  FOR ALL TO authenticated
  USING (public.is_academic_admin()) WITH CHECK (public.is_academic_admin());
CREATE POLICY "announcement_read_published" ON "Announcement"
  FOR SELECT TO authenticated
  USING ("status" = 'PUBLISHED');

-- ---- AnnouncementAttachment: admin ALL; readable iff parent is PUBLISHED ----
ALTER TABLE "AnnouncementAttachment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "announcement_attachment_admin_all" ON "AnnouncementAttachment"
  FOR ALL TO authenticated
  USING (public.is_academic_admin()) WITH CHECK (public.is_academic_admin());
CREATE POLICY "announcement_attachment_read_published" ON "AnnouncementAttachment"
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "Announcement" a
    WHERE a.id = "AnnouncementAttachment"."announcementId"
      AND a."status" = 'PUBLISHED'
  ));

-- ---- SchoolCalendarEvent: admin ALL; authenticated SELECT (read-only) ----
ALTER TABLE "SchoolCalendarEvent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "calendar_admin_all" ON "SchoolCalendarEvent"
  FOR ALL TO authenticated
  USING (public.is_academic_admin()) WITH CHECK (public.is_academic_admin());
CREATE POLICY "calendar_read_all" ON "SchoolCalendarEvent"
  FOR SELECT TO authenticated
  USING (true);
