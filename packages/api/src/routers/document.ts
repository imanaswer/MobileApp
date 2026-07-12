import {
  approveDocument,
  archiveDocument,
  createServiceContext,
  createUploadedDocument,
  deleteDraftDocument,
  documentDownloadUrl,
  documentUploadUrl,
  generateDocument,
  listSchoolDocuments,
  listStudentDocuments,
} from "@repo/business";
import {
  createUploadedDocumentInput,
  documentUploadUrlInput,
  generateDocumentInput,
  idInput,
  listDocumentsInput,
  listStudentDocumentsInput,
} from "@repo/validation";

import { protectedProcedure, router, storageProcedure } from "../trpc";

/**
 * Document / certificate procedures (M15, ADR-023). Thin transport only — validate
 * (Zod) then delegate; the business service enforces permission (document:manage/
 * approve/read), scope, the lifecycle (GENERATED/UPLOADED→APPROVED→ARCHIVED,
 * delete-drafts-only), the frozen generation snapshot, the APPROVED-only visibility
 * gate for non-admins, in-tx audit, and 60s signed-URL minting. No logic, no role
 * strings, no Prisma.
 */
export const documentRouter = router({
  /* ---- generate / upload (office / admin) ---- */
  /** Generate a certificate (metadata-first; snapshot frozen at issue). */
  generate: protectedProcedure
    .input(generateDocumentInput)
    .mutation(({ ctx, input }) => generateDocument(createServiceContext(ctx.user), input)),
  /** Mint a one-time signed UPLOAD URL (authz runs in the service BEFORE any URL exists). */
  uploadUrl: storageProcedure
    .input(documentUploadUrlInput)
    .mutation(({ ctx, input }) =>
      documentUploadUrl(createServiceContext(ctx.user), ctx.storage, input),
    ),
  /** Record an UPLOADED document after its file is put to the signed URL. */
  createUploaded: protectedProcedure
    .input(createUploadedDocumentInput)
    .mutation(({ ctx, input }) => createUploadedDocument(createServiceContext(ctx.user), input)),

  /* ---- lifecycle ---- */
  /** Draft → APPROVED (the visibility gate). */
  approve: protectedProcedure
    .input(idInput)
    .mutation(({ ctx, input }) => approveDocument(createServiceContext(ctx.user), input.id)),
  /** APPROVED → ARCHIVED (soft-retire, terminal). */
  archive: protectedProcedure
    .input(idInput)
    .mutation(({ ctx, input }) => archiveDocument(createServiceContext(ctx.user), input.id)),
  /** Hard-delete a draft (GENERATED/UPLOADED only). */
  deleteDraft: protectedProcedure
    .input(idInput)
    .mutation(({ ctx, input }) => deleteDraftDocument(createServiceContext(ctx.user), input.id)),

  /* ---- reads ---- */
  /** Admin console — school-wide, filterable by student / type / status. */
  list: protectedProcedure
    .input(listDocumentsInput)
    .query(({ ctx, input }) => listSchoolDocuments(createServiceContext(ctx.user), input)),
  /** A student's documents (admin all; teacher own-section / parent own-child = APPROVED only). */
  listStudentDocuments: protectedProcedure
    .input(listStudentDocumentsInput)
    .query(({ ctx, input }) => {
      const { studentId, ...rest } = input;
      return listStudentDocuments(createServiceContext(ctx.user), studentId, rest);
    }),
  /** Mint a short-lived (60s) signed READ URL; authz + APPROVED-only gate run first. */
  downloadUrl: storageProcedure
    .input(idInput)
    .mutation(({ ctx, input }) =>
      documentDownloadUrl(createServiceContext(ctx.user), ctx.storage, input.id),
    ),
});
