-- ---------------------------------------------------------------------------
-- M8 — Staff.name (display name, ADR-016).
--
-- Every person entity carries a human name EXCEPT Staff (Student.firstName/lastName,
-- Parent.name; User is frozen and holds none). Teachers therefore had no display name —
-- surfaces fell back to employeeId or raw userId cuids. ADR-016 adds ONE free-text `name`
-- field (Indian-name-friendly, no forced first/last split) on Staff (the profile row),
-- NOT on the frozen User (identity) row.
--
-- The ONLY frozen-table change permitted in M8 (pre-approved freeze-protocol exception):
-- proven additive by `prisma migrate diff` (frozen-HEAD → schema shows only this ALTER).
-- A plain `ADD COLUMN name TEXT NOT NULL` would fail on existing rows, so it is done in
-- three steps in one migration: add nullable → backfill → SET NOT NULL. Backfill uses
-- `'Staff ' || employeeId` (real names arrive via the now-required create/import path and
-- seed); no other table is touched.
-- ---------------------------------------------------------------------------

-- 1) add nullable
ALTER TABLE "Staff" ADD COLUMN "name" TEXT;

-- 2) backfill existing rows (placeholder from employeeId; real names come from seed/import)
UPDATE "Staff" SET "name" = 'Staff ' || "employeeId" WHERE "name" IS NULL;

-- 3) enforce NOT NULL going forward
ALTER TABLE "Staff" ALTER COLUMN "name" SET NOT NULL;
