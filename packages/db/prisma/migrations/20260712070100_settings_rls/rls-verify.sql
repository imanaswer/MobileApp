-- M16 School Configuration RLS isolation proof (Step-3 verification).
-- Seeds as superuser (RLS bypassed), grants table privs to authenticated/anon,
-- then impersonates each persona (SET LOCAL ROLE + jwt sub) and asserts exactly
-- which rows are visible / writable. Whole run rolls back — no fixture persists.
-- auth.uid() reads current_setting('request.jwt.claim.sub'); User.id == the
-- Supabase auth uid, so ids are uuids here.
--
-- Proves (ADR-024 §3/§8):
--   • BrandingSettings — admin + teacher + parent SELECT (broadly-readable);
--     anon none; only admin may WRITE (teacher UPDATE denied).
--   • SchoolSettings / SystemSettings — admin SELECT only; teacher/parent/anon none.

\set admin '00000000-0000-0000-0000-0000000000a1'
\set tA    '00000000-0000-0000-0000-0000000000c1'
\set pA    '00000000-0000-0000-0000-0000000000d1'

BEGIN;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON "BrandingSettings", "SchoolSettings", "SystemSettings" TO authenticated, anon;

-- ---- fixtures (as superuser) ----
INSERT INTO "School"(id,name,"updatedAt") VALUES ('sch','S',now());
INSERT INTO "User"(id,"schoolId",role,status,"updatedAt") VALUES
  (:'admin','sch','OFFICE_ADMIN','ACTIVE',now()),
  (:'tA','sch','TEACHER','ACTIVE',now()),
  (:'pA','sch','PARENT','ACTIVE',now());
INSERT INTO "BrandingSettings"(id,"schoolId","displayName","updatedAt") VALUES ('b1','sch','Brand',now());
INSERT INTO "SchoolSettings"(id,"schoolId","principalName","updatedAt")   VALUES ('s1','sch','Principal',now());
INSERT INTO "SystemSettings"(id,"schoolId","updatedAt")                    VALUES ('y1','sch',now());

\echo '============ READ isolation — BrandingSettings (broadly-readable) ============'
SELECT set_config('request.jwt.claim.sub',:'admin',true) \gset s_
SET LOCAL ROLE authenticated;
SELECT 'admin   (exp b1)' AS persona, coalesce(string_agg(id,','),'<none>') AS visible FROM "BrandingSettings";
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',:'tA',true) \gset s_
SET LOCAL ROLE authenticated;
SELECT 'teacher (exp b1)' AS persona, coalesce(string_agg(id,','),'<none>') AS visible FROM "BrandingSettings";
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',:'pA',true) \gset s_
SET LOCAL ROLE authenticated;
SELECT 'parent  (exp b1)' AS persona, coalesce(string_agg(id,','),'<none>') AS visible FROM "BrandingSettings";
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true) \gset s_
SET LOCAL ROLE anon;
SELECT 'anon    (exp <none>)' AS persona, coalesce(string_agg(id,','),'<none>') AS visible FROM "BrandingSettings";
RESET ROLE;

\echo '============ READ isolation — SchoolSettings (admin-only) ============'
SELECT set_config('request.jwt.claim.sub',:'admin',true) \gset s_
SET LOCAL ROLE authenticated;
SELECT 'admin   (exp s1)' AS persona, coalesce(string_agg(id,','),'<none>') AS visible FROM "SchoolSettings";
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',:'tA',true) \gset s_
SET LOCAL ROLE authenticated;
SELECT 'teacher (exp <none>)' AS persona, coalesce(string_agg(id,','),'<none>') AS visible FROM "SchoolSettings";
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',:'pA',true) \gset s_
SET LOCAL ROLE authenticated;
SELECT 'parent  (exp <none>)' AS persona, coalesce(string_agg(id,','),'<none>') AS visible FROM "SchoolSettings";
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true) \gset s_
SET LOCAL ROLE anon;
SELECT 'anon    (exp <none>)' AS persona, coalesce(string_agg(id,','),'<none>') AS visible FROM "SchoolSettings";
RESET ROLE;

\echo '============ READ isolation — SystemSettings (admin-only) ============'
SELECT set_config('request.jwt.claim.sub',:'admin',true) \gset s_
SET LOCAL ROLE authenticated;
SELECT 'admin   (exp y1)' AS persona, coalesce(string_agg(id,','),'<none>') AS visible FROM "SystemSettings";
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',:'tA',true) \gset s_
SET LOCAL ROLE authenticated;
SELECT 'teacher (exp <none>)' AS persona, coalesce(string_agg(id,','),'<none>') AS visible FROM "SystemSettings";
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',:'pA',true) \gset s_
SET LOCAL ROLE authenticated;
SELECT 'parent  (exp <none>)' AS persona, coalesce(string_agg(id,','),'<none>') AS visible FROM "SystemSettings";
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true) \gset s_
SET LOCAL ROLE anon;
SELECT 'anon    (exp <none>)' AS persona, coalesce(string_agg(id,','),'<none>') AS visible FROM "SystemSettings";
RESET ROLE;

\echo '============ WRITE isolation — BrandingSettings ============'
SELECT set_config('request.jwt.claim.sub',:'admin',true) \gset s_
SET LOCAL ROLE authenticated;
WITH u AS (UPDATE "BrandingSettings" SET "primaryColor"='#111' WHERE id='b1' RETURNING id)
SELECT 'admin   UPDATE branding (exp 1 row)'   AS test, count(*) AS rows FROM u;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',:'tA',true) \gset s_
SET LOCAL ROLE authenticated;
WITH u AS (UPDATE "BrandingSettings" SET "primaryColor"='#222' WHERE id='b1' RETURNING id)
SELECT 'teacher UPDATE branding (exp 0 rows)'  AS test, count(*) AS rows FROM u;
WITH u AS (UPDATE "SystemSettings" SET "theme"='dark' WHERE id='y1' RETURNING id)
SELECT 'teacher UPDATE system   (exp 0 rows)'  AS test, count(*) AS rows FROM u;
RESET ROLE;

ROLLBACK;
