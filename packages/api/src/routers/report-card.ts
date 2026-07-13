import {
  approveReportCard,
  correctReportCard,
  createServiceContext,
  draftClassTeacherRemark,
  editReportCard,
  generateReportCard,
  getReportCard,
  listReportCardsForEnrollment,
  listReportCardsForSection,
  publishReportCardAndNotify,
  reopenReportCard,
  reportCardPdfDownloadUrl,
  revokeReportCard,
  submitReportCard,
} from "@repo/business";
import {
  draftClassTeacherRemarkInput,
  editReportCardInput,
  enrollmentIdInput,
  generateReportCardInput,
  idInput,
  reopenReportCardInput,
  reportCardIdInput,
  revokeReportCardInput,
  sectionRosterInput,
} from "@repo/validation";

import { protectedProcedure, renderProcedure, router, storageProcedure } from "../trpc";

/**
 * Report Card procedures (M7, ADR-014). Thin transport only — validate (Zod) then
 * delegate to a business service; the service enforces permission + scope (admin
 * lifecycle school-wide; the class teacher — via assertClassTeacherOfEnrollment —
 * drafts a remark + submits; parent reads own-child PUBLISHED), the
 * DRAFT→SUBMITTED→APPROVED→PUBLISHED lifecycle (+ reopen/revoke/correct), the
 * snapshot freeze at approve, supersede-then-publish in one tx (R3), and writes
 * audit in-transaction. No logic, no role strings, no Prisma.
 */
export const reportCardRouter = router({
  /** One card, read-scoped (admin any / class-teacher own-section / parent own-child PUBLISHED). */
  get: protectedProcedure
    .input(idInput)
    .query(({ ctx, input }) => getReportCard(createServiceContext(ctx.user), input.id)),
  /** A student's card trail for one enrollment (year-over-year; parent → PUBLISHED only). */
  listForEnrollment: protectedProcedure
    .input(enrollmentIdInput)
    .query(({ ctx, input }) =>
      listReportCardsForEnrollment(createServiceContext(ctx.user), input.enrollmentId),
    ),
  /** Every card in a section for a year (admin any; the assigned class teacher of the section). */
  listForSection: protectedProcedure
    .input(sectionRosterInput)
    .query(({ ctx, input }) => listReportCardsForSection(createServiceContext(ctx.user), input)),
  /** Generate (or return the existing) DRAFT for a (enrollment, kind, scope). Admin. */
  generate: protectedProcedure
    .input(generateReportCardInput)
    .mutation(({ ctx, input }) => generateReportCard(createServiceContext(ctx.user), input)),
  /** Class teacher drafts the teacher remark (DRAFT only; class-teacher scope). */
  draftRemark: protectedProcedure
    .input(draftClassTeacherRemarkInput)
    .mutation(({ ctx, input }) => draftClassTeacherRemark(createServiceContext(ctx.user), input)),
  /** Admin edits principal remark / promotion decision (pre-publish). */
  edit: protectedProcedure
    .input(editReportCardInput)
    .mutation(({ ctx, input }) => editReportCard(createServiceContext(ctx.user), input)),
  /** Class teacher submits for review (DRAFT → SUBMITTED). */
  submit: protectedProcedure
    .input(reportCardIdInput)
    .mutation(({ ctx, input }) =>
      submitReportCard(createServiceContext(ctx.user), input.reportCardId),
    ),
  /** Admin approves — freezes the snapshot (SUBMITTED → APPROVED). */
  approve: protectedProcedure
    .input(reportCardIdInput)
    .mutation(({ ctx, input }) =>
      approveReportCard(createServiceContext(ctx.user), input.reportCardId),
    ),
  /** Admin reopens (SUBMITTED/APPROVED → DRAFT), clearing stamps + snapshot. Reason required. */
  reopen: protectedProcedure
    .input(reopenReportCardInput)
    .mutation(({ ctx, input }) => reopenReportCard(createServiceContext(ctx.user), input)),
  /** Admin publishes (APPROVED → PUBLISHED), superseding any prior published version in one tx. */
  publish: renderProcedure.input(reportCardIdInput).mutation(({ ctx, input }) =>
    // M10: composer publishes then notifies post-commit (ADR-018 §3). M-PDF: it also renders
    // + stores the PDF best-effort after commit (ADR-026) — hence the render-capable procedure.
    publishReportCardAndNotify(
      createServiceContext(ctx.user),
      ctx.storage,
      ctx.pdf,
      input.reportCardId,
    ),
  ),
  /** Mint a short-lived (300s) signed READ URL for the card's stored PDF; scope checked first. */
  pdfDownloadUrl: storageProcedure
    .input(reportCardIdInput)
    .mutation(({ ctx, input }) =>
      reportCardPdfDownloadUrl(createServiceContext(ctx.user), ctx.storage, input.reportCardId),
    ),
  /** Admin revokes a published card (PUBLISHED → REVOKED). Reason required. */
  revoke: protectedProcedure
    .input(revokeReportCardInput)
    .mutation(({ ctx, input }) => revokeReportCard(createServiceContext(ctx.user), input)),
  /** Admin starts a correction — spawns a new DRAFT version from a published card (R3). */
  correct: protectedProcedure
    .input(reportCardIdInput)
    .mutation(({ ctx, input }) =>
      correctReportCard(createServiceContext(ctx.user), input.reportCardId),
    ),
});
