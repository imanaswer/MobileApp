-- ---------------------------------------------------------------------------
-- M16 — School Administration & Configuration (ADR-024).
--
-- THREE additive config tables over frozen M1–M15 — the school administration
-- panel's storage. Each is keyed schoolId @unique → EXACTLY ONE row per school
-- ("single configuration row per school"); a settings write is an upsert on that
-- row. Configuration INFLUENCES ONLY FUTURE ACTIONS and never rewrites a
-- historical record (the brief's hard rule); in v1 it is read by NO frozen engine
-- (ADR-024 §5) — several fields (numbering/timezone/language/academic defaults)
-- are stored-but-inert until a future per-domain wire.
--
--   • BrandingSettings — the one BROADLY-READABLE table (any authenticated user;
--                        a parent's app renders logo/name/colours). logoPath is a
--                        PRIVATE `branding` bucket path, signed on read (ADR-004);
--                        never a URL (DB conventions §4). RLS: admin ALL + any
--                        authenticated SELECT (settings_rls, Step 3).
--   • SchoolSettings   — ADMIN-ONLY. School profile + academic defaults (the
--                        AcademicSettings group folded in, ADR-024 §3) + numbering.
--                        academicDefaults is a RESERVED Json escape-hatch for the
--                        compound report-card/attendance/grading defaults no engine
--                        reads yet (ADR-024 §4). invoice/certificatePrefix stored
--                        but NOT wired to M13/M15 in v1 (ADR-024 §5).
--   • SystemSettings   — ADMIN-ONLY. Localization/technical defaults; language
--                        reuses the frozen Locale enum (no new enum). workingDays
--                        is a native Int[] (0=Sun … 6=Sat), default Mon–Fri.
--
-- The frozen M1 `School` row (settings/logoUrl/defaultLocale) is NOT reused
-- (ADR-024 §2) — no ALTER. No relational FKs: schoolId is a loose tenant scalar
-- (ADR-008) and updatedByUserId is a loose actor scalar (the M3 *ByUserId idiom),
-- so the brief's "Restrict FKs" is vacuous here. Every business mutation writes
-- AuditLog in the same transaction (ADR-007). RLS is a separate migration
-- (settings_rls, Step 3).
--
-- Purely additive: creates 3 tables + their unique indexes only. NO frozen table
-- is altered — proven by `prisma migrate diff` (m9_verify head → schema shows ONLY
-- these three CreateTable + three unique indexes, zero ALTER, zero enum change).
-- ---------------------------------------------------------------------------

-- CreateTable
CREATE TABLE "BrandingSettings" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "logoPath" TEXT,
    "primaryColor" TEXT,
    "secondaryColor" TEXT,
    "displayName" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandingSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolSettings" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "website" TEXT,
    "principalName" TEXT,
    "academicYearStartMonth" INTEGER,
    "invoicePrefix" TEXT,
    "certificatePrefix" TEXT,
    "academicDefaults" JSONB,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSettings" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "language" "Locale" NOT NULL DEFAULT 'EN',
    "theme" TEXT NOT NULL DEFAULT 'light',
    "workingDays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex  — one config row per school (brief: schoolId unique)
CREATE UNIQUE INDEX "BrandingSettings_schoolId_key" ON "BrandingSettings"("schoolId");

-- CreateIndex  — one config row per school (brief: schoolId unique)
CREATE UNIQUE INDEX "SchoolSettings_schoolId_key" ON "SchoolSettings"("schoolId");

-- CreateIndex  — one config row per school (brief: schoolId unique)
CREATE UNIQUE INDEX "SystemSettings_schoolId_key" ON "SystemSettings"("schoolId");
