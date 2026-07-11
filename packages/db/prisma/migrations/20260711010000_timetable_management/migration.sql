-- ---------------------------------------------------------------------------
-- M9 — Timetable Management (ADR-017).
--
-- A weekly section timetable over frozen M1–M8. Three additive tables + one enum:
--   • BellSchedule — the year's day structure; EXACTLY ONE per year (unique below).
--   • Period       — numbered clock-time slots within a bell schedule; some breaks.
--   • TimetableEntry — one weekly slot: section × weekday × period → subject +
--                      teacher + room. teacherId → User (mirrors TeacherAssignment;
--                      RLS teacherId = auth.uid()). academicYearId denormalized for
--                      the section/teacher/year read paths.
--
-- Double-booking is STRUCTURALLY impossible: the two unique indexes on
-- TimetableEntry — (sectionId, weekday, periodId) and (teacherId, weekday, periodId)
-- — forbid a section OR a teacher appearing twice in the same weekday+period; a race
-- is a DB error, not a silent overwrite (M4/M6 idiom). Ownership (teacher actually
-- teaches this subject in this section), period-overlap, cross-year integrity and
-- no-class-on-break are business-layer checks (STEP 5); AuditLog is written by the
-- service in the same transaction (ADR-007). Clock times are TIME (no date); ALL FKs
-- RESTRICT (no cascade — brief). RLS is a separate migration (timetable_rls, Step 4).
--
-- Purely additive: creates 1 enum + 3 tables + their indexes + their own FKs. NO
-- frozen table (AcademicYear/Section/Subject/User) is altered — the four back-relations
-- are virtual (no SQL); proven by `prisma migrate diff` (baseline → schema shows only
-- these CREATEs, zero ALTER).
-- ---------------------------------------------------------------------------

-- CreateEnum
CREATE TYPE "Weekday" AS ENUM ('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN');

-- CreateTable
CREATE TABLE "BellSchedule" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BellSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Period" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "bellScheduleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "startTime" TIME NOT NULL,
    "endTime" TIME NOT NULL,
    "isBreak" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Period_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimetableEntry" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "weekday" "Weekday" NOT NULL,
    "room" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimetableEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BellSchedule_schoolId_idx" ON "BellSchedule"("schoolId");

-- CreateIndex  — EXACTLY ONE bell schedule per year (M9 scope; ADR-017 §1)
CREATE UNIQUE INDEX "BellSchedule_schoolId_academicYearId_key" ON "BellSchedule"("schoolId", "academicYearId");

-- CreateIndex
CREATE INDEX "Period_bellScheduleId_idx" ON "Period"("bellScheduleId");

-- CreateIndex  — deterministic period sequence within a schedule
CREATE UNIQUE INDEX "Period_bellScheduleId_order_key" ON "Period"("bellScheduleId", "order");

-- CreateIndex
CREATE INDEX "TimetableEntry_sectionId_weekday_periodId_idx" ON "TimetableEntry"("sectionId", "weekday", "periodId");

-- CreateIndex
CREATE INDEX "TimetableEntry_teacherId_weekday_periodId_idx" ON "TimetableEntry"("teacherId", "weekday", "periodId");

-- CreateIndex
CREATE INDEX "TimetableEntry_academicYearId_idx" ON "TimetableEntry"("academicYearId");

-- CreateIndex
CREATE INDEX "TimetableEntry_schoolId_idx" ON "TimetableEntry"("schoolId");

-- CreateIndex  — no section double-booking / duplicate period / one subject+teacher per slot
CREATE UNIQUE INDEX "TimetableEntry_sectionId_weekday_periodId_key" ON "TimetableEntry"("sectionId", "weekday", "periodId");

-- CreateIndex  — no teacher double-booking
CREATE UNIQUE INDEX "TimetableEntry_teacherId_weekday_periodId_key" ON "TimetableEntry"("teacherId", "weekday", "periodId");

-- AddForeignKey
ALTER TABLE "BellSchedule" ADD CONSTRAINT "BellSchedule_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Period" ADD CONSTRAINT "Period_bellScheduleId_fkey" FOREIGN KEY ("bellScheduleId") REFERENCES "BellSchedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "Period"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---- CHECK constraints Prisma can't express (mirrored by schema comments) ----
-- A period's clock window is well-formed, and order is 1-based (business relies on both).
ALTER TABLE "Period" ADD CONSTRAINT "Period_time_order_check"
  CHECK ("startTime" < "endTime" AND "order" > 0);
