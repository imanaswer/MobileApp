-- CreateEnum
CREATE TYPE "ExamType" AS ENUM ('UNIT_TEST', 'MONTHLY', 'MID_TERM', 'HALF_YEARLY', 'MODEL', 'ANNUAL', 'PRACTICAL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ExamSectionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'LOCKED');

-- CreateTable
CREATE TABLE "Exam" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "gradeScaleId" TEXT,
    "name" TEXT NOT NULL,
    "type" "ExamType" NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "startDate" DATE,
    "endDate" DATE,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "publishedByStaffId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "maxTheory" INTEGER NOT NULL,
    "maxPractical" INTEGER,
    "passMark" INTEGER NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamSection" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "status" "ExamSectionStatus" NOT NULL DEFAULT 'DRAFT',
    "createdByStaffId" TEXT NOT NULL,
    "submittedByStaffId" TEXT,
    "lockedByStaffId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "unlockedByStaffId" TEXT,
    "unlockedAt" TIMESTAMP(3),
    "unlockReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mark" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "examSectionId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "theoryObtained" DOUBLE PRECISION,
    "practicalObtained" DOUBLE PRECISION,
    "isAbsent" BOOLEAN NOT NULL DEFAULT false,
    "totalObtained" DOUBLE PRECISION,
    "percentage" DOUBLE PRECISION,
    "gradeBandId" TEXT,
    "gradeLetterSnapshot" TEXT,
    "gradePointSnapshot" DOUBLE PRECISION,
    "enteredByStaffId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradeScale" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GradeScale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradeBand" (
    "id" TEXT NOT NULL,
    "gradeScaleId" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "minPercent" DOUBLE PRECISION NOT NULL,
    "maxPercent" DOUBLE PRECISION NOT NULL,
    "gradePoint" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GradeBand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Exam_schoolId_idx" ON "Exam"("schoolId");

-- CreateIndex
CREATE INDEX "Exam_academicYearId_displayOrder_idx" ON "Exam"("academicYearId", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Exam_academicYearId_name_key" ON "Exam"("academicYearId", "name");

-- CreateIndex
CREATE INDEX "Assessment_subjectId_idx" ON "Assessment"("subjectId");

-- CreateIndex
CREATE INDEX "Assessment_schoolId_idx" ON "Assessment"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "Assessment_examId_subjectId_key" ON "Assessment"("examId", "subjectId");

-- CreateIndex
CREATE INDEX "ExamSection_sectionId_idx" ON "ExamSection"("sectionId");

-- CreateIndex
CREATE INDEX "ExamSection_status_idx" ON "ExamSection"("status");

-- CreateIndex
CREATE INDEX "ExamSection_schoolId_idx" ON "ExamSection"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamSection_assessmentId_sectionId_key" ON "ExamSection"("assessmentId", "sectionId");

-- CreateIndex
CREATE INDEX "Mark_examSectionId_idx" ON "Mark"("examSectionId");

-- CreateIndex
CREATE INDEX "Mark_enrollmentId_idx" ON "Mark"("enrollmentId");

-- CreateIndex
CREATE INDEX "Mark_schoolId_idx" ON "Mark"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "Mark_assessmentId_enrollmentId_key" ON "Mark"("assessmentId", "enrollmentId");

-- CreateIndex
CREATE INDEX "GradeScale_schoolId_idx" ON "GradeScale"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "GradeScale_schoolId_name_key" ON "GradeScale"("schoolId", "name");

-- CreateIndex
CREATE INDEX "GradeBand_gradeScaleId_idx" ON "GradeBand"("gradeScaleId");

-- CreateIndex
CREATE UNIQUE INDEX "GradeBand_gradeScaleId_grade_key" ON "GradeBand"("gradeScaleId", "grade");

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_gradeScaleId_fkey" FOREIGN KEY ("gradeScaleId") REFERENCES "GradeScale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_publishedByStaffId_fkey" FOREIGN KEY ("publishedByStaffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSection" ADD CONSTRAINT "ExamSection_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSection" ADD CONSTRAINT "ExamSection_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSection" ADD CONSTRAINT "ExamSection_createdByStaffId_fkey" FOREIGN KEY ("createdByStaffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSection" ADD CONSTRAINT "ExamSection_submittedByStaffId_fkey" FOREIGN KEY ("submittedByStaffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSection" ADD CONSTRAINT "ExamSection_lockedByStaffId_fkey" FOREIGN KEY ("lockedByStaffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSection" ADD CONSTRAINT "ExamSection_unlockedByStaffId_fkey" FOREIGN KEY ("unlockedByStaffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mark" ADD CONSTRAINT "Mark_examSectionId_fkey" FOREIGN KEY ("examSectionId") REFERENCES "ExamSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mark" ADD CONSTRAINT "Mark_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mark" ADD CONSTRAINT "Mark_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mark" ADD CONSTRAINT "Mark_gradeBandId_fkey" FOREIGN KEY ("gradeBandId") REFERENCES "GradeBand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mark" ADD CONSTRAINT "Mark_enteredByStaffId_fkey" FOREIGN KEY ("enteredByStaffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeBand" ADD CONSTRAINT "GradeBand_gradeScaleId_fkey" FOREIGN KEY ("gradeScaleId") REFERENCES "GradeScale"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ============================================================================
-- Raw-SQL invariants (not expressible in the Prisma DSL) — ADR-012.
-- btree_gist is already enabled (academic_structure migration; AcademicTerm uses it).
-- ============================================================================

-- Assessment: non-negative marks; passMark within the achievable maximum. (ADR-012 §7)
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_marks_valid"
  CHECK ("maxTheory" >= 0
     AND ("maxPractical" IS NULL OR "maxPractical" >= 0)
     AND "passMark" >= 0
     AND "passMark" <= "maxTheory" + COALESCE("maxPractical", 0));

-- Mark: non-negative obtained marks; percentage in [0,100]; and an ABSENT mark
-- carries NO obtained marks (contradiction made structurally impossible — ADR-012 §3).
ALTER TABLE "Mark" ADD CONSTRAINT "Mark_theory_nonneg"
  CHECK ("theoryObtained" IS NULL OR "theoryObtained" >= 0);
ALTER TABLE "Mark" ADD CONSTRAINT "Mark_practical_nonneg"
  CHECK ("practicalObtained" IS NULL OR "practicalObtained" >= 0);
ALTER TABLE "Mark" ADD CONSTRAINT "Mark_percentage_range"
  CHECK ("percentage" IS NULL OR ("percentage" >= 0 AND "percentage" <= 100));
ALTER TABLE "Mark" ADD CONSTRAINT "Mark_absent_has_no_marks"
  CHECK (NOT "isAbsent" OR ("theoryObtained" IS NULL AND "practicalObtained" IS NULL));

-- GradeScale: exactly ONE default per school, so Exam.gradeScaleId fallback is
-- deterministic (mirrors the ACTIVE-academic-year partial-unique idiom).
CREATE UNIQUE INDEX "GradeScale_one_default_per_school"
  ON "GradeScale" ("schoolId") WHERE "isDefault";

-- GradeBand: valid bounds + NON-OVERLAPPING bands within a scale (the "grade
-- boundary" edge case). Half-open [minPercent, maxPercent); the top band uses a
-- >100 sentinel so a perfect 100 still lands in a band (ADR-012 §3, Step 9).
ALTER TABLE "GradeBand" ADD CONSTRAINT "GradeBand_bounds_valid"
  CHECK ("minPercent" >= 0 AND "maxPercent" > "minPercent");
ALTER TABLE "GradeBand" ADD CONSTRAINT "GradeBand_no_overlap"
  EXCLUDE USING gist ("gradeScaleId" WITH =, numrange("minPercent"::numeric, "maxPercent"::numeric, '[)') WITH &&);
