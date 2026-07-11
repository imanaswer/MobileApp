-- ---------------------------------------------------------------------------
-- M11 — Announcements, Circulars & School Calendar (ADR-019).
--
-- Persistent school communication over frozen M1–M10. Three additive tables +
-- three enums:
--   • Announcement           — a DRAFT→PUBLISHED→ARCHIVED circular. scope + targetId
--                              decide WHO sees it (business-resolved; targetId is a
--                              loose polymorphic Class.id/Section.id — DATABASE_
--                              CONVENTIONS §2 line 18). publishedAt stamped at publish
--                              and kept through archive (CHECK below). On PUBLISH it
--                              OPTIONALLY emits an M10 Notification(type=ANNOUNCEMENT)
--                              via the canonical *AndNotify path (ADR-018 §3) — M10 is
--                              reused, never edited.
--   • AnnouncementAttachment — a file (private bucket announcement-attachments, signed
--                              on read; ADR-004). add/remove only while DRAFT.
--   • SchoolCalendarEvent    — holiday / event / exam / meeting / other; @db.Date range
--                              (CHECK endDate >= startDate). EXAM events are MANUAL, not
--                              synced from frozen M5 (ADR-019 deviation #5).
--
-- Lifecycle: teachers DRAFT (own-section, announcement:draft); admins PUBLISH
-- (announcement:manage). DRAFT hard-deletes; PUBLISHED archives. All FKs RESTRICT
-- (brief — no Cascade; a DRAFT delete removes attachments then the announcement in one
-- service tx). Every mutation writes AuditLog in the same transaction (ADR-007). RLS is
-- a separate migration (announcement_rls / calendar_rls, Step 3).
--
-- Purely additive: creates 3 enums + 3 tables + their indexes + their own FKs. NO frozen
-- table (AcademicYear, Staff) is altered — the AcademicYear.announcements/calendarEvents
-- and Staff.announcementsCreated/... back-relations are VIRTUAL (no SQL column); proven
-- by `prisma migrate diff` (M10 head → schema shows ONLY these CREATEs, zero ALTER).
-- ---------------------------------------------------------------------------

-- CreateEnum
CREATE TYPE "AnnouncementStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AnnouncementScope" AS ENUM ('WHOLE_SCHOOL', 'CLASS', 'SECTION', 'TEACHERS', 'PARENTS');

-- CreateEnum
CREATE TYPE "CalendarEventType" AS ENUM ('HOLIDAY', 'EVENT', 'EXAM', 'MEETING', 'OTHER');

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "AnnouncementStatus" NOT NULL DEFAULT 'DRAFT',
    "scope" "AnnouncementScope" NOT NULL,
    "targetId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdByStaffId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnouncementAttachment" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedByStaffId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnouncementAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolCalendarEvent" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "eventType" "CalendarEventType" NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "isAllDay" BOOLEAN NOT NULL DEFAULT true,
    "createdByStaffId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolCalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex  — the published feed (brief)
CREATE INDEX "Announcement_status_publishedAt_idx" ON "Announcement"("status", "publishedAt");

-- CreateIndex  — scoped-feed filter (brief)
CREATE INDEX "Announcement_scope_status_idx" ON "Announcement"("scope", "status");

-- CreateIndex
CREATE INDEX "Announcement_schoolId_idx" ON "Announcement"("schoolId");

-- CreateIndex
CREATE INDEX "Announcement_academicYearId_idx" ON "Announcement"("academicYearId");

-- CreateIndex
CREATE INDEX "AnnouncementAttachment_announcementId_idx" ON "AnnouncementAttachment"("announcementId");

-- CreateIndex  — upcoming events (brief)
CREATE INDEX "SchoolCalendarEvent_startDate_idx" ON "SchoolCalendarEvent"("startDate");

-- CreateIndex  — exam schedule / holidays (brief)
CREATE INDEX "SchoolCalendarEvent_eventType_startDate_idx" ON "SchoolCalendarEvent"("eventType", "startDate");

-- CreateIndex
CREATE INDEX "SchoolCalendarEvent_schoolId_idx" ON "SchoolCalendarEvent"("schoolId");

-- CreateIndex
CREATE INDEX "SchoolCalendarEvent_academicYearId_idx" ON "SchoolCalendarEvent"("academicYearId");

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_createdByStaffId_fkey" FOREIGN KEY ("createdByStaffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementAttachment" ADD CONSTRAINT "AnnouncementAttachment_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementAttachment" ADD CONSTRAINT "AnnouncementAttachment_uploadedByStaffId_fkey" FOREIGN KEY ("uploadedByStaffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolCalendarEvent" ADD CONSTRAINT "SchoolCalendarEvent_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolCalendarEvent" ADD CONSTRAINT "SchoolCalendarEvent_createdByStaffId_fkey" FOREIGN KEY ("createdByStaffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---- CHECK constraints (structural invariants; ADR-019 §1) ------------------

-- Publish stamp: publishedAt is present iff the announcement has ever been published.
-- DRAFT ⟹ NULL; PUBLISHED and ARCHIVED (which was once PUBLISHED) keep the stamp. This
-- is the ReportCard published-stamp idiom — the parent-visibility gate can't drift from
-- its stamp. Strictly implies the brief's "published ⟹ publishedAt NOT NULL".
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_published_stamp"
  CHECK (("publishedAt" IS NOT NULL) = ("status" IN ('PUBLISHED', 'ARCHIVED')));

-- A calendar event's range is well-formed (a single-day event has endDate = startDate).
ALTER TABLE "SchoolCalendarEvent" ADD CONSTRAINT "SchoolCalendarEvent_date_range"
  CHECK ("endDate" >= "startDate");
