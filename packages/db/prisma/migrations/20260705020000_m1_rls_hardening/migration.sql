-- ---------------------------------------------------------------------------
-- M1 RLS hardening (security-fix exception to the frozen-module rule).
--
-- M1 shipped the auth/profile tables (School, User, DeviceToken, AuditLog) with
-- NO row-level security. All app access already routes tRPC -> business -> Prisma
-- (service_role, BYPASSRLS), so enabling RLS with tight read policies changes no
-- app behavior — it only closes any DIRECT client-JWT (PostgREST) access that the
-- default `authenticated` GRANTs would otherwise permit (e.g. a parent enumerating
-- every User row). Same stance as the academic tables (ADR-004):
--   * defense-in-depth only; the business layer is the authoritative gate
--   * ENABLE (not FORCE) so service_role/table-owner keeps bypassing
--   * role/status resolved from the DB `User` profile, never the JWT claims
--   * no write policies -> all writes denied for authenticated/anon (writes go
--     through service_role); anon matches no policy -> denied everywhere.
--
-- Verified before writing: no source-level Supabase-client `.from(...)` reads of
-- these tables exist (apps/*, packages/auth), so admin-only reads break nothing.
-- ---------------------------------------------------------------------------

-- Is the current auth user an ACTIVE platform admin (SUPER_ADMIN | OFFICE_ADMIN)?
-- SECURITY DEFINER so it can read `User` regardless of caller grants/RLS (owner is
-- exempt while FORCE is off); search_path pinned per Supabase hardening.
-- (Deliberately self-contained: mirrors is_academic_admin() rather than depend on
--  an M2 migration's function from an M1 hardening migration. ponytail: 5-line dup
--  over a backwards cross-migration dependency; consolidate if a 3rd copy appears.)
CREATE OR REPLACE FUNCTION public.is_admin()
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

-- School: org metadata (may hold config in `settings`). Admin read only;
-- no direct client read path exists.
ALTER TABLE "School" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "school_admin_read" ON "School"
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- User: a user may read ONLY their own row; admins may read all. This is the
-- policy that stops a parent/teacher enumerating other users.
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_read_self" ON "User"
  FOR SELECT TO authenticated
  USING ("id" = (SELECT auth.uid())::text);
CREATE POLICY "user_admin_read_all" ON "User"
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- DeviceToken: owner may read only their own tokens.
ALTER TABLE "DeviceToken" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "device_token_owner_read" ON "DeviceToken"
  FOR SELECT TO authenticated
  USING ("userId" = (SELECT auth.uid())::text);

-- AuditLog: append-only, sensitive. Admin read only; parents/teachers denied.
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_log_admin_read" ON "AuditLog"
  FOR SELECT TO authenticated
  USING (public.is_admin());
