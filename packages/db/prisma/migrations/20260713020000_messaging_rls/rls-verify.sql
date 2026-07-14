-- M18 Messaging RLS isolation proof (Step-3 verification).
-- Seeds as superuser (RLS bypassed), grants table privs to authenticated/anon,
-- then impersonates each persona (SET LOCAL ROLE + jwt sub) and asserts exactly
-- which rows are visible. Whole run rolls back — no fixture persists.
-- auth.uid() reads current_setting('request.jwt.claim.sub'); User.id == the
-- Supabase auth uid, so ids are uuids here.
--
-- Proves: a party sees ONLY threads they belong to (staffUserId/guardianUserId);
-- the counterparty of thread 1 cannot read thread 2 and vice-versa; messages follow
-- their parent thread's party gate; Anon sees none.

\set tA '00000000-0000-0000-0000-0000000000c1'
\set pA '00000000-0000-0000-0000-0000000000d1'
\set tB '00000000-0000-0000-0000-0000000000c2'
\set pB '00000000-0000-0000-0000-0000000000d2'

BEGIN;
GRANT SELECT, INSERT, UPDATE, DELETE ON "MessageThread" TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Message" TO authenticated, anon;

-- ---- fixtures (as superuser) ----
INSERT INTO "School"(id,name,"updatedAt") VALUES ('sch','S',now());
INSERT INTO "Student"(id,"schoolId","admissionNo","firstName","lastName","updatedAt") VALUES
  ('sA','sch','A001','Child','A',now()),
  ('sB','sch','A002','Child','B',now());
INSERT INTO "User"(id,"schoolId",role,status,"updatedAt") VALUES
  (:'tA','sch','TEACHER','ACTIVE',now()),
  (:'pA','sch','PARENT','ACTIVE',now()),
  (:'tB','sch','TEACHER','ACTIVE',now()),
  (:'pB','sch','PARENT','ACTIVE',now());
-- thread th1: staff tA ↔ guardian pA about sA ; thread th2: staff tB ↔ guardian pB about sB
INSERT INTO "MessageThread"(id,"schoolId","staffUserId","guardianUserId","studentId","updatedAt") VALUES
  ('th1','sch',:'tA',:'pA','sA',now()),
  ('th2','sch',:'tB',:'pB','sB',now());
INSERT INTO "Message"(id,"threadId","senderUserId",body) VALUES
  ('m1','th1',:'tA','hi from tA'),
  ('m2','th2',:'tB','hi from tB');

\echo '============ READ isolation — MessageThread ============'
SELECT set_config('request.jwt.claim.sub',:'tA',true) \gset s_
SET LOCAL ROLE authenticated;
SELECT 'staff tA (exp th1 only — NOT th2)' AS persona, coalesce(string_agg(id,',' ORDER BY id),'<none>') AS threads FROM "MessageThread";
SELECT 'staff tA messages (exp m1 only)' AS persona, coalesce(string_agg(id,',' ORDER BY id),'<none>') AS messages FROM "Message";
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',:'pA',true) \gset s_
SET LOCAL ROLE authenticated;
SELECT 'guardian pA (exp th1 only)' AS persona, coalesce(string_agg(id,',' ORDER BY id),'<none>') AS threads FROM "MessageThread";
SELECT 'guardian pA messages (exp m1 only)' AS persona, coalesce(string_agg(id,',' ORDER BY id),'<none>') AS messages FROM "Message";
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',:'tB',true) \gset s_
SET LOCAL ROLE authenticated;
SELECT 'staff tB (exp th2 only — NOT th1)' AS persona, coalesce(string_agg(id,',' ORDER BY id),'<none>') AS threads FROM "MessageThread";
SELECT 'staff tB messages (exp m2 only)' AS persona, coalesce(string_agg(id,',' ORDER BY id),'<none>') AS messages FROM "Message";
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true) \gset s_
SET LOCAL ROLE anon;
SELECT 'anon threads (exp <none>)' AS persona, coalesce(string_agg(id,',' ORDER BY id),'<none>') AS threads FROM "MessageThread";
SELECT 'anon messages (exp <none>)' AS persona, coalesce(string_agg(id,',' ORDER BY id),'<none>') AS messages FROM "Message";
RESET ROLE;

ROLLBACK;
