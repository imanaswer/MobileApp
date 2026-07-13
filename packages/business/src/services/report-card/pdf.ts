import { PERMISSIONS, STORAGE_BUCKETS } from "@repo/constants";
import { errorFields, logger, NotFoundError } from "@repo/core";
import type { ReportCardDto } from "@repo/types";

import { assertCan } from "../../authorization";
import type { ServiceContext } from "../../context";
import type { PdfRenderer, PdfRow, ReportCardPdfData } from "../document/pdf-renderer.port";
import type { StoragePort } from "../people/document-storage.service";

import { assertReportCardReadScope, loadReportCardInSchool } from "./scope";

/** Signed download URLs stay valid this long — the report-card norm (ADR-026; 300s, ADR-004). */
const DOWNLOAD_URL_TTL_SECONDS = 300;

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // Asia/Kolkata, no DST.
function istDate(iso: string | null): string {
  const ms = iso ? Date.parse(iso) : Date.now();
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function reportCardRows(card: ReportCardDto, assessment: string): PdfRow[] {
  const rows: PdfRow[] = [];
  rows.push({ label: "Assessment", value: assessment });
  if (card.rank !== null) {
    rows.push({
      label: "Rank",
      value: `${card.rank}${card.cohortSize ? ` of ${card.cohortSize}` : ""}`,
    });
  }
  if (card.gpaSnapshot !== null) rows.push({ label: "GPA", value: String(card.gpaSnapshot) });
  if (card.cgpaSnapshot !== null) rows.push({ label: "CGPA", value: String(card.cgpaSnapshot) });
  if (card.attendancePercentage !== null) {
    rows.push({ label: "Attendance", value: `${card.attendancePercentage}%` });
  }
  if (card.promotionDecision) rows.push({ label: "Promotion", value: card.promotionDecision });
  if (card.classTeacherRemark) {
    rows.push({ label: "Class Teacher", value: card.classTeacherRemark });
  }
  if (card.principalRemark) rows.push({ label: "Principal", value: card.principalRemark });
  return rows;
}

/**
 * BEST-EFFORT (ADR-026): render a PUBLISHED card from its FROZEN snapshot (ADR-014),
 * upload the PDF to the private DOCUMENTS bucket, and persist its PATH (never a URL).
 * Runs AFTER the publish transaction has committed — a failure here is logged and
 * swallowed, NEVER propagated: `pdfPath` is not lifecycle-gating, so a render/upload
 * hiccup must not fail (or appear to fail) a durable publish.
 */
export async function renderReportCardPdf(
  ctx: ServiceContext,
  storage: StoragePort,
  pdf: PdfRenderer,
  card: ReportCardDto,
): Promise<void> {
  try {
    const enrollment = await ctx.repositories.enrollments.findById(card.enrollmentId);
    if (!enrollment) return;
    // The mutation-return DTO carries null exam/term display names (ADR-016 — labels are
    // read-path only), so resolve the assessment label from the scope IDs, mirroring
    // resolveCardNames in scope.ts. student/class/section are fetched live below.
    const [student, klass, section, branding, exam, term] = await Promise.all([
      ctx.repositories.students.findById(enrollment.studentId),
      ctx.repositories.classes.findById(enrollment.classId),
      enrollment.sectionId
        ? ctx.repositories.sections.findById(enrollment.sectionId)
        : Promise.resolve(null),
      ctx.repositories.brandingSettings.getBySchool(card.schoolId),
      card.examId ? ctx.repositories.exams.findById(card.examId) : Promise.resolve(null),
      card.termId ? ctx.repositories.academicTerms.findById(card.termId) : Promise.resolve(null),
    ]);
    const data: ReportCardPdfData = {
      schoolName: branding?.displayName ?? "School",
      title: "Report Card",
      studentName: student ? `${student.firstName} ${student.lastName}` : "—",
      class: klass?.name ?? null,
      section: section?.name ?? null,
      issuedOn: istDate(card.publishedAt),
      rows: reportCardRows(card, exam?.name ?? term?.name ?? "Annual"),
    };
    const bytes = await pdf.renderReportCard(data);
    const storagePath = `${card.schoolId}/${enrollment.studentId}/${crypto.randomUUID()}-report-card-${card.id}.pdf`;
    await storage.uploadObject(STORAGE_BUCKETS.DOCUMENTS, storagePath, bytes, "application/pdf");
    await ctx.repositories.reportCards.setPdfPath(card.id, storagePath);
  } catch (err) {
    logger.error("report card pdf render failed", {
      route: "reportCard.pdf",
      reportCardId: card.id,
      ...errorFields(err),
    });
  }
}

/**
 * Mint a short-lived (300s) signed READ URL for a card's stored PDF (ADR-026). Runs
 * the FULL read-scope chain (permission → tenant → row scope) BEFORE any URL exists,
 * exactly like the document mint — so a parent cannot pull another child's card by id.
 * 404 if no PDF has been rendered yet (`pdfPath` null).
 */
export async function reportCardPdfDownloadUrl(
  ctx: ServiceContext,
  storage: StoragePort,
  reportCardId: string,
): Promise<{ url: string }> {
  assertCan(ctx.user, PERMISSIONS.REPORT_CARD_READ);
  const card = await loadReportCardInSchool(ctx, reportCardId);
  await assertReportCardReadScope(ctx, card);
  if (!card.pdfPath) {
    throw new NotFoundError("No PDF has been generated for this report card yet");
  }
  const url = await storage.createSignedDownloadUrl(
    STORAGE_BUCKETS.DOCUMENTS,
    card.pdfPath,
    DOWNLOAD_URL_TTL_SECONDS,
  );
  return { url };
}
