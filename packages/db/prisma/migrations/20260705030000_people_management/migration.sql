-- M3 Step 2 — People Management structure (Student, StudentDocument, Parent,
-- StudentParent, Staff, Enrollment). RLS is a separate migration (Step 4), the
-- same split M2 used (academic_structure + academic_rls).

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');
CREATE TYPE "StudentStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'GRADUATED', 'WITHDRAWN');
CREATE TYPE "StudentRelationship" AS ENUM ('FATHER', 'MOTHER', 'GUARDIAN', 'EMERGENCY_CONTACT');
CREATE TYPE "PreferredContact" AS ENUM ('PHONE', 'EMAIL', 'WHATSAPP');
CREATE TYPE "StudentDocumentType" AS ENUM ('BIRTH_CERTIFICATE', 'PASSPORT', 'AADHAAR', 'MEDICAL_RECORD', 'TRANSFER_CERTIFICATE', 'PHOTO', 'OTHER');
CREATE TYPE "EnrollmentStatus" AS ENUM ('ADMITTED', 'ACTIVE', 'PROMOTED', 'RETAINED', 'TRANSFERRED', 'DROPPED', 'ALUMNI');

-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "admissionNo" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dob" DATE,
    "gender" "Gender",
    "bloodGroup" TEXT,
    "nationality" TEXT,
    "aadhaar" TEXT,
    "passport" TEXT,
    "address" TEXT,
    "photoPath" TEXT,
    "status" "StudentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentDocument" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" "StudentDocumentType" NOT NULL,
    "storagePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "checksum" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "uploadedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Parent" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "occupation" TEXT,
    "address" TEXT,
    "preferredContact" "PreferredContact" NOT NULL DEFAULT 'PHONE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Parent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentParent" (
    "studentId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "relationship" "StudentRelationship" NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentParent_pkey" PRIMARY KEY ("studentId", "parentId", "relationship")
);

-- CreateTable
CREATE TABLE "Staff" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "department" TEXT,
    "qualification" TEXT,
    "experienceYears" INTEGER,
    "joiningDate" DATE,
    "bio" TEXT,
    "photoPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "sectionId" TEXT,
    "rollNo" INTEGER,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ADMITTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Student_schoolId_status_idx" ON "Student"("schoolId", "status");
CREATE INDEX "Student_schoolId_lastName_firstName_idx" ON "Student"("schoolId", "lastName", "firstName");
CREATE UNIQUE INDEX "Student_schoolId_admissionNo_key" ON "Student"("schoolId", "admissionNo");

-- CreateIndex
CREATE INDEX "StudentDocument_studentId_type_idx" ON "StudentDocument"("studentId", "type");
CREATE INDEX "StudentDocument_schoolId_idx" ON "StudentDocument"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "Parent_userId_key" ON "Parent"("userId");
CREATE INDEX "Parent_schoolId_idx" ON "Parent"("schoolId");

-- CreateIndex
CREATE INDEX "StudentParent_parentId_idx" ON "StudentParent"("parentId");
CREATE INDEX "StudentParent_studentId_idx" ON "StudentParent"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Staff_userId_key" ON "Staff"("userId");
CREATE UNIQUE INDEX "Staff_schoolId_employeeId_key" ON "Staff"("schoolId", "employeeId");
CREATE INDEX "Staff_schoolId_idx" ON "Staff"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_studentId_academicYearId_key" ON "Enrollment"("studentId", "academicYearId");
CREATE INDEX "Enrollment_academicYearId_sectionId_idx" ON "Enrollment"("academicYearId", "sectionId");
CREATE INDEX "Enrollment_academicYearId_classId_idx" ON "Enrollment"("academicYearId", "classId");
CREATE INDEX "Enrollment_schoolId_idx" ON "Enrollment"("schoolId");

-- AddForeignKey
ALTER TABLE "StudentDocument" ADD CONSTRAINT "StudentDocument_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Parent" ADD CONSTRAINT "Parent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentParent" ADD CONSTRAINT "StudentParent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentParent" ADD CONSTRAINT "StudentParent_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Parent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Raw-SQL constraints Prisma cannot express (DATABASE_CONVENTIONS §3, ADR-010)
-- ---------------------------------------------------------------------------

-- One PRIMARY contact per student (partial unique — same idiom as ACTIVE year).
CREATE UNIQUE INDEX "StudentParent_one_primary_per_student"
  ON "StudentParent"("studentId") WHERE "isPrimary";

-- Aadhaar unique per school when present (a shared national ID is a data error).
CREATE UNIQUE INDEX "Student_aadhaar_per_school"
  ON "Student"("schoolId", "aadhaar") WHERE "aadhaar" IS NOT NULL;

-- Roll number unique within a section for a given year (when both are present).
CREATE UNIQUE INDEX "Enrollment_rollNo_per_section_year"
  ON "Enrollment"("academicYearId", "sectionId", "rollNo")
  WHERE "sectionId" IS NOT NULL AND "rollNo" IS NOT NULL;

-- BUSINESS RULE: a roll number is assigned only after section allocation —
-- a rollNo without a section is invalid.
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_rollNo_needs_section"
  CHECK ("rollNo" IS NULL OR "sectionId" IS NOT NULL);
