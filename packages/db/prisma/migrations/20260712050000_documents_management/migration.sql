-- ---------------------------------------------------------------------------
-- M15 — Documents, Certificates & Downloads (ADR-023).
--
-- TWO additive tables over frozen M1–M14 — the per-student issued-certificate
-- center. DISTINCT from M3 StudentDocument (KYC/identity UPLOADS with
-- type-visibility); this is a school-ISSUED record with an approval lifecycle
-- (ADR-023 §2). Bytes — when present — live in the PRIVATE `documents` bucket,
-- signed 60s on read (ADR-004/ADR-023 §1); this table stores PATHS only.
--
--   • DocumentTemplate — a per-type certificate template. Minimal in v1
--                        (ADR-023 §4): labels/enables which types the office may
--                        generate. `body` is RESERVED for the deferred renderer
--                        (HTML/layout) and is null in metadata-only v1 — no
--                        template engine is built yet. Admin-managed.
--   • Document         — a student's issued/uploaded document. GENERATED (from a
--                        template, values FROZEN into snapshotJson) or UPLOADED
--                        (office uploads a file) → APPROVED (the visibility gate:
--                        parents/teachers see APPROVED only, ADR-023 §6) →
--                        ARCHIVED (soft-retire). snapshotJson is written once on
--                        generate and NEVER mutated — a later profile change can't
--                        rewrite an issued cert (ADR-014 snapshot philosophy,
--                        ADR-023 §3). storagePath NULLABLE mirrors
--                        ReportCard.pdfPath: storage never lifecycle-gates. Every
--                        business mutation writes AuditLog in the same
--                        transaction (ADR-007).
--
-- All FKs to frozen tables RESTRICT (brief); Document → DocumentTemplate also
-- RESTRICT (templateId nullable — UPLOADED docs need no template). ADR-014
-- report-card PDF is NOT re-rendered here; a REPORT_CARD row is an UPLOADED slot.
-- RLS is a separate migration (documents_rls, Step 3).
--
-- Purely additive: creates 2 enums + 2 tables + their indexes and FKs. NO frozen
-- table (Student, DocumentTemplate is new, …) is altered — the Student.issuedDocuments
-- back-relation is VIRTUAL (no SQL column); proven by `prisma migrate diff` (M13
-- head → schema shows ONLY these additions, zero ALTER on any frozen table).
-- ---------------------------------------------------------------------------

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('BONAFIDE_CERTIFICATE', 'STUDY_CERTIFICATE', 'CHARACTER_CERTIFICATE', 'TRANSFER_CERTIFICATE', 'FEE_RECEIPT', 'REPORT_CARD', 'HALL_TICKET', 'ID_CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('GENERATED', 'UPLOADED', 'APPROVED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "DocumentTemplate" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "name" TEXT NOT NULL,
    "body" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "status" "DocumentStatus" NOT NULL,
    "templateId" TEXT,
    "snapshotJson" JSONB,
    "storagePath" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "generatedByUserId" TEXT,
    "uploadedByUserId" TEXT,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentTemplate_schoolId_type_idx" ON "DocumentTemplate"("schoolId", "type");

-- CreateIndex  — a student's docs by type (brief: studentId, type)
CREATE INDEX "Document_studentId_type_idx" ON "Document"("studentId", "type");

-- CreateIndex  — admin console filter (brief: status)
CREATE INDEX "Document_schoolId_status_idx" ON "Document"("schoolId", "status");

-- CreateIndex  — recent-first lists (brief: createdAt)
CREATE INDEX "Document_schoolId_createdAt_idx" ON "Document"("schoolId", "createdAt");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
