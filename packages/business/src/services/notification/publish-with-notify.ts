import type { ExamDto, HomeworkDto, LeaveRequestDto, ReportCardDto } from "@repo/types";

import type { ServiceContext } from "../../context";
import { decideLeave } from "../attendance";
import type { PdfRenderer } from "../document/pdf-renderer.port";
import { publishExam } from "../exam";
import { publishHomework } from "../homework";
import type { StoragePort } from "../people/document-storage.service";
import { publishReportCard, renderReportCardPdf } from "../report-card";

import {
  emitExamPublished,
  emitHomeworkPublished,
  emitLeaveDecided,
  emitReportCardPublished,
} from "./events";

/**
 * Publish-with-notification COMPOSITION (M10 Step 5, ADR-018 §3) — the application
 * seam that couples a frozen publish to its notification emit. This lives in the
 * BUSINESS layer (not transport): the router calls exactly ONE of these and stays
 * thin. The existing publish services are UNTOUCHED — each composer merely calls
 * the frozen service, then, once it has committed, fires the best-effort emit.
 * Notifications therefore never fire before commit; a legitimate re-publish
 * (reopen, correction) composes again by design.
 *
 * This is the canonical pattern for future milestones adding notifications to an
 * existing action: add an `emit*` + a `*AndNotify` composer here, repoint the
 * router — never inline the orchestration in transport, never edit the frozen
 * service.
 */

export async function publishHomeworkAndNotify(
  ctx: ServiceContext,
  homeworkId: string,
): Promise<HomeworkDto> {
  const homework = await publishHomework(ctx, homeworkId);
  await emitHomeworkPublished(ctx, homework);
  return homework;
}

export async function publishExamAndNotify(ctx: ServiceContext, examId: string): Promise<ExamDto> {
  const exam = await publishExam(ctx, examId);
  await emitExamPublished(ctx, exam);
  return exam;
}

export async function publishReportCardAndNotify(
  ctx: ServiceContext,
  storage: StoragePort,
  pdf: PdfRenderer,
  reportCardId: string,
): Promise<ReportCardDto> {
  const card = await publishReportCard(ctx, reportCardId);
  // Post-commit, BEST-EFFORT: render the PDF from the frozen snapshot and store its path
  // (ADR-026). renderReportCardPdf swallows its own failures — never fails the publish.
  await renderReportCardPdf(ctx, storage, pdf, card);
  await emitReportCardPublished(ctx, card);
  return card;
}

/**
 * M12 (ADR-020 §3): approve/reject a leave request, then notify the parent. The
 * frozen M4 `decideLeave` is UNCHANGED — this composer calls it and fires the
 * best-effort emit after it commits. The attendance router repoints to this.
 */
export async function decideLeaveAndNotify(
  ctx: ServiceContext,
  input: { leaveId: string; decision: "APPROVED" | "REJECTED" },
): Promise<LeaveRequestDto> {
  const leave = await decideLeave(ctx, input);
  await emitLeaveDecided(ctx, leave);
  return leave;
}
