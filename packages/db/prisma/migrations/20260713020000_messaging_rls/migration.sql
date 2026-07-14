-- ---------------------------------------------------------------------------
-- M18 Step 3 — Row-Level Security for Teacher ↔ Parent Messaging.
--
-- DEFENSE-IN-DEPTH ONLY (ADR-002). The authoritative gate is the business layer
-- (assertCan(message:*) + party check). The app reaches these tables as
-- service_role (BYPASSRLS) via tRPC -> business -> Prisma, so these policies do
-- NOT touch the app path — they only deny/limit DIRECT client-JWT access.
--
-- Party-only: a thread is visible iff auth.uid() is one of its two parties
-- (staffUserId or guardianUserId); a message is visible iff auth.uid() is a party
-- of its parent thread. `User.id` == the Supabase auth UID, so auth.uid() joins
-- straight to the party columns. Writes run as service_role. Anon: no policy = denied.
--
-- NOTE (single-tenant, ADR-008): policies do NOT match schoolId; scoping lives in
-- the repository layer.
--
-- Purely additive: enables RLS + policies on the two M18 tables.
-- ---------------------------------------------------------------------------

-- ---- MessageThread: visible/writable only to its two parties ----
ALTER TABLE "MessageThread" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "message_thread_party" ON "MessageThread" FOR ALL TO authenticated
  USING ("staffUserId" = (SELECT auth.uid())::text OR "guardianUserId" = (SELECT auth.uid())::text)
  WITH CHECK ("staffUserId" = (SELECT auth.uid())::text OR "guardianUserId" = (SELECT auth.uid())::text);

-- ---- Message: visible/writable iff caller is a party of the parent thread ----
ALTER TABLE "Message" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "message_party" ON "Message" FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM "MessageThread" t WHERE t.id = "Message"."threadId"
      AND (t."staffUserId" = (SELECT auth.uid())::text OR t."guardianUserId" = (SELECT auth.uid())::text)))
  WITH CHECK (EXISTS (SELECT 1 FROM "MessageThread" t WHERE t.id = "Message"."threadId"
      AND (t."staffUserId" = (SELECT auth.uid())::text OR t."guardianUserId" = (SELECT auth.uid())::text)));
