-- M4 Step 2 — Attendance Management structure (AttendanceSession,
-- AttendanceRecord, LeaveRequest, AttendanceCorrection, Holiday). ADR-011:
-- attendance belongs to Enrollment, never Student. RLS is a separate migration
-- (Step 4), the same split M2/M3 used.

-- CreateEnum
CREATE TYPE "AttendanceSessionType" AS ENUM ('MORNING', 'AFTERNOON', 'SUBJECT');
CREATE TYPE "AttendanceSessionStatus" AS ENUM ('OPEN', 'FINALIZED');
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'LEAVE');
CREATE TYPE "LeaveRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE "AttendanceCorrectionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "HolidayType" AS ENUM ('NATIONAL', 'SCHOOL', 'FESTIVAL', 'EMERGENCY_CLOSURE');

-- CreateTable
CREATE TABLE "AttendanceSession" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "sessionType" "AttendanceSessionType" NOT NULL,
    "subjectId" TEXT,
    "markedByUserId" TEXT NOT NULL,
    "status" "AttendanceSessionStatus" NOT NULL DEFAULT 'OPEN',
    "isHolidayOverride" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "fromDate" DATE NOT NULL,
    "toDate" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "LeaveRequestStatus" NOT NULL DEFAULT 'PENDING',
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceCorrection" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "attendanceRecordId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "fromStatus" "AttendanceStatus" NOT NULL,
    "toStatus" "AttendanceStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "AttendanceCorrectionStatus" NOT NULL DEFAULT 'PENDING',
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "type" "HolidayType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttendanceSession_sectionId_date_idx" ON "AttendanceSession"("sectionId", "date");
CREATE INDEX "AttendanceSession_academicYearId_date_idx" ON "AttendanceSession"("academicYearId", "date");
CREATE INDEX "AttendanceSession_markedByUserId_date_idx" ON "AttendanceSession"("markedByUserId", "date");
CREATE INDEX "AttendanceSession_schoolId_idx" ON "AttendanceSession"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_sessionId_enrollmentId_key" ON "AttendanceRecord"("sessionId", "enrollmentId");
CREATE INDEX "AttendanceRecord_enrollmentId_idx" ON "AttendanceRecord"("enrollmentId");
CREATE INDEX "AttendanceRecord_schoolId_idx" ON "AttendanceRecord"("schoolId");

-- CreateIndex
CREATE INDEX "LeaveRequest_enrollmentId_status_idx" ON "LeaveRequest"("enrollmentId", "status");
CREATE INDEX "LeaveRequest_schoolId_status_idx" ON "LeaveRequest"("schoolId", "status");
CREATE INDEX "LeaveRequest_parentId_idx" ON "LeaveRequest"("parentId");

-- CreateIndex
CREATE INDEX "AttendanceCorrection_attendanceRecordId_idx" ON "AttendanceCorrection"("attendanceRecordId");
CREATE INDEX "AttendanceCorrection_requestedByUserId_status_idx" ON "AttendanceCorrection"("requestedByUserId", "status");
CREATE INDEX "AttendanceCorrection_schoolId_status_idx" ON "AttendanceCorrection"("schoolId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_academicYearId_date_key" ON "Holiday"("academicYearId", "date");
CREATE INDEX "Holiday_schoolId_idx" ON "Holiday"("schoolId");

-- AddForeignKey
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_markedByUserId_fkey" FOREIGN KEY ("markedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AttendanceSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Parent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceCorrection" ADD CONSTRAINT "AttendanceCorrection_attendanceRecordId_fkey" FOREIGN KEY ("attendanceRecordId") REFERENCES "AttendanceRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceCorrection" ADD CONSTRAINT "AttendanceCorrection_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceCorrection" ADD CONSTRAINT "AttendanceCorrection_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holiday" ADD CONSTRAINT "Holiday_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Raw-SQL constraints Prisma cannot express (DATABASE_CONVENTIONS §3, ADR-011)
-- ---------------------------------------------------------------------------

-- One session per (section, date, sessionType, subject). Postgres treats NULLs
-- as distinct in unique indexes, so the rule needs two partial indexes: daily
-- sessions (no subject) dedupe on the triple; subject sessions on all four.
CREATE UNIQUE INDEX "AttendanceSession_daily_key"
  ON "AttendanceSession"("sectionId", "date", "sessionType")
  WHERE "subjectId" IS NULL;
CREATE UNIQUE INDEX "AttendanceSession_subject_key"
  ON "AttendanceSession"("sectionId", "date", "sessionType", "subjectId")
  WHERE "subjectId" IS NOT NULL;

-- A SUBJECT session must carry a subject; a daily session must not.
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_subject_iff_type"
  CHECK (("sessionType" = 'SUBJECT') = ("subjectId" IS NOT NULL));

-- Leave date range sanity.
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_dates_valid"
  CHECK ("fromDate" <= "toDate");

-- An enrollment cannot hold two live (PENDING/APPROVED) leaves with
-- intersecting date ranges — same btree_gist idiom as AcademicTerm_no_overlap
-- (extension created in 20260705000000_academic_structure). Terminal rows
-- (REJECTED/CANCELLED) fall outside the predicate, so re-application is legal.
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_no_live_overlap"
  EXCLUDE USING gist (
    "enrollmentId" WITH =,
    daterange("fromDate", "toDate", '[]') WITH &&
  ) WHERE ("status" IN ('PENDING', 'APPROVED'));

-- One PENDING correction per record — approvals cannot race, and a record's
-- pending state is unambiguous.
CREATE UNIQUE INDEX "AttendanceCorrection_one_pending_per_record"
  ON "AttendanceCorrection"("attendanceRecordId")
  WHERE "status" = 'PENDING';

-- A correction must actually change the status.
ALTER TABLE "AttendanceCorrection" ADD CONSTRAINT "AttendanceCorrection_changes_status"
  CHECK ("fromStatus" <> "toStatus");
