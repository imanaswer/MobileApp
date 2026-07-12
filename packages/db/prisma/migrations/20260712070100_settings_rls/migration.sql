-- ---------------------------------------------------------------------------
-- M16 Step 3 — Row-Level Security for School Configuration (ADR-024 §8).
--
-- DEFENSE-IN-DEPTH ONLY (ADR-002/024). The authoritative gate is the business
-- layer (assertCan(settings:manage) for writes; a role-shaped read projection).
-- The app reaches these tables as service_role (BYPASSRLS) via tRPC -> business
-- -> Prisma, so these policies do NOT touch the app path — they only deny/limit
-- DIRECT client-JWT access.
--
-- Reuses is_academic_admin() (SUPER_ADMIN | OFFICE_ADMIN, ACTIVE) VERBATIM — NO
-- new helper. Role/status come from the DB `User` row; auth.uid() == User.id.
--
-- NOTE (single-tenant, ADR-008): policies do NOT match schoolId; tenant scoping
-- lives in the repository layer.
--
-- Model (ADR-024 §3/§8) — the read-audience per table IS the config split:
--   • BrandingSettings — admin ALL; any authenticated SELECT (read-only). The
--     ONE broadly-readable table — a parent's app renders the logo/name/colours
--     (the M11 SchoolCalendarEvent authenticated-read precedent). Writes run as
--     service_role (admin ALL policy).
--   • SchoolSettings   — admin ALL only. School profile + academic defaults +
--     numbering are admin metadata; teachers/parents get the "public settings"
--     they need via the BUSINESS read projection, never a direct row read.
--   • SystemSettings   — admin ALL only (same rationale).
--   • Anon: no policy = denied everywhere.
--
-- Purely additive: enables RLS + policies on the three M16 tables only.
-- ---------------------------------------------------------------------------

-- ---- BrandingSettings: admin ALL; any authenticated SELECT (read-only) ----
ALTER TABLE "BrandingSettings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "branding_admin_all" ON "BrandingSettings"
  FOR ALL TO authenticated
  USING (public.is_academic_admin()) WITH CHECK (public.is_academic_admin());
CREATE POLICY "branding_authenticated_read" ON "BrandingSettings"
  FOR SELECT TO authenticated
  USING (true);

-- ---- SchoolSettings: admin ALL only ----
ALTER TABLE "SchoolSettings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "school_settings_admin_all" ON "SchoolSettings"
  FOR ALL TO authenticated
  USING (public.is_academic_admin()) WITH CHECK (public.is_academic_admin());

-- ---- SystemSettings: admin ALL only ----
ALTER TABLE "SystemSettings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "system_settings_admin_all" ON "SystemSettings"
  FOR ALL TO authenticated
  USING (public.is_academic_admin()) WITH CHECK (public.is_academic_admin());
