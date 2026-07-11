import { ForbiddenError, NotFoundError, ValidationError } from "@repo/core";
import type { Enrollment, ReportCard } from "@repo/db";
import type { IsoUtcString, ReportCardDto } from "@repo/types";

import type { ServiceContext } from "../../context";
import { assertClassTeacherOfEnrollment } from "../academic/class-teacher.service";
import { isFullAccess, parentChildIds } from "../people/scope";

export { recordAudit } from "../people/scope";
export { assertClassTeacherOfEnrollment } from "../academic/class-teacher.service";

const iso = (d: Date | null): IsoUtcString | null => (d ? (d.toISOString() as IsoUtcString) : null);

/** True when the acting user is a PARENT (PUBLISHED-only, own-child read scope). */
export function isParent(ctx: ServiceContext): boolean {
  return ctx.user.role === "PARENT";
}

export async function loadReportCardInSchool(ctx: ServiceContext, id: string): Promise<ReportCard> {
  const row = await ctx.repositories.reportCards.findById(id);
  if (!row || row.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Report card not found");
  }
  return row;
}

export async function loadEnrollmentInSchool(ctx: ServiceContext, id: string): Promise<Enrollment> {
  const row = await ctx.repositories.enrollments.findById(id);
  if (!row || row.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Enrollment not found");
  }
  return row;
}

/**
 * MANDATORY year-consistency gate (centralized — every write path calls this). A
 * card's scope YEAR must equal its enrollment's year: EXAM → exam.academicYearId,
 * TERM → term.academicYearId, ANNUAL → trivially the enrollment's year. The kind⟺scope
 * DB CHECK only enforces presence, not the cross-table year (a CHECK cannot join) —
 * so a mismatch is rejected here as a ValidationError. Also proves the exam/term is
 * in-tenant (an in-school enrollment + matching year ⇒ same tenant). Returns the
 * loaded enrollment (callers reuse it for the snapshot).
 */
export async function assertScopeYearMatches(
  ctx: ServiceContext,
  scope: {
    enrollmentId: string;
    kind: ReportCard["kind"];
    examId: string | null;
    termId: string | null;
  },
): Promise<Enrollment> {
  const enrollment = await loadEnrollmentInSchool(ctx, scope.enrollmentId);
  if (scope.kind === "EXAM") {
    if (!scope.examId) {
      throw new ValidationError("An exam report card requires an exam");
    }
    const exam = await ctx.repositories.exams.findById(scope.examId);
    if (!exam || exam.schoolId !== ctx.user.schoolId) {
      throw new NotFoundError("Exam not found");
    }
    if (exam.academicYearId !== enrollment.academicYearId) {
      throw new ValidationError("The exam and the enrollment are in different academic years");
    }
  } else if (scope.kind === "TERM") {
    if (!scope.termId) {
      throw new ValidationError("A term report card requires a term");
    }
    const term = await ctx.repositories.academicTerms.findById(scope.termId);
    if (!term) {
      throw new NotFoundError("Academic term not found");
    }
    if (term.academicYearId !== enrollment.academicYearId) {
      throw new ValidationError("The term and the enrollment are in different academic years");
    }
  }
  // ANNUAL: the card's year IS the enrollment's — no scope FK to cross-check.
  return enrollment;
}

/**
 * Read scope for one card: admin → any; teacher → the assigned class teacher of the
 * card's enrollment (the shared gate — a subject teacher is refused); parent → own
 * child AND PUBLISHED only. Non-published cards are invisible to parents.
 */
export async function assertReportCardReadScope(
  ctx: ServiceContext,
  card: ReportCard,
): Promise<void> {
  if (isFullAccess(ctx)) {
    return;
  }
  if (ctx.user.role === "TEACHER") {
    return assertClassTeacherOfEnrollment(ctx, card.enrollmentId);
  }
  if (ctx.user.role === "PARENT" && card.status === "PUBLISHED") {
    const enrollment = await loadEnrollmentInSchool(ctx, card.enrollmentId);
    const childIds = await parentChildIds(ctx);
    if (childIds.includes(enrollment.studentId)) {
      return;
    }
  }
  throw new ForbiddenError("Out of scope for this report card");
}

/**
 * The acting user's Staff row id (B3 provisioning invariant — mirrors the exam/
 * homework resolvers). Every card mutation records WHO acted; a user without a Staff
 * row is a provisioning error surfaced as a clean ValidationError.
 */
export async function resolveActingStaffId(ctx: ServiceContext): Promise<string> {
  const staff = await ctx.repositories.staff.findByUserId(ctx.user.userId);
  if (!staff) {
    throw new ValidationError(
      "Acting user has no staff profile (required for report-card actions)",
    );
  }
  return staff.id;
}

/** Read-time display labels for a card (ADR-016). Null on mutation returns (the default). */
export interface CardNames {
  examName: string | null;
  termName: string | null;
  classTeacherName: string | null;
}
const NO_NAMES: CardNames = { examName: null, termName: null, classTeacherName: null };

/**
 * Resolve a card's display labels via REPOSITORIES (never the exam/academic service — those
 * carry `assertCan`, which would break a parent read). examName/termName from the scope ids;
 * classTeacherName = the remark author (`submittedByStaffId → Staff.name`, ADR-016 — accurate
 * across a mid-year class-teacher replacement, and reliably set for any PUBLISHED card).
 */
export async function resolveCardNames(ctx: ServiceContext, card: ReportCard): Promise<CardNames> {
  const [exam, term, submitter] = await Promise.all([
    card.examId ? ctx.repositories.exams.findById(card.examId) : Promise.resolve(null),
    card.termId ? ctx.repositories.academicTerms.findById(card.termId) : Promise.resolve(null),
    card.submittedByStaffId
      ? ctx.repositories.staff.findById(card.submittedByStaffId)
      : Promise.resolve(null),
  ]);
  return {
    examName: exam?.name ?? null,
    termName: term?.name ?? null,
    classTeacherName: submitter?.name ?? null,
  };
}

/** Batched name resolution for a list of cards — distinct ids resolved once (no per-row N+1). */
export async function resolveCardNamesBatch(
  ctx: ServiceContext,
  cards: readonly ReportCard[],
): Promise<CardNames[]> {
  const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => x !== null))];
  const examIds = uniq(cards.map((c) => c.examId));
  const termIds = uniq(cards.map((c) => c.termId));
  const staffIds = uniq(cards.map((c) => c.submittedByStaffId));
  const [exams, terms, staff] = await Promise.all([
    Promise.all(examIds.map((id) => ctx.repositories.exams.findById(id))),
    Promise.all(termIds.map((id) => ctx.repositories.academicTerms.findById(id))),
    Promise.all(staffIds.map((id) => ctx.repositories.staff.findById(id))),
  ]);
  const examName = new Map(exams.filter((e) => e !== null).map((e) => [e.id, e.name]));
  const termName = new Map(terms.filter((t) => t !== null).map((t) => [t.id, t.name]));
  const staffName = new Map(staff.filter((s) => s !== null).map((s) => [s.id, s.name]));
  return cards.map((c) => ({
    examName: c.examId ? (examName.get(c.examId) ?? null) : null,
    termName: c.termId ? (termName.get(c.termId) ?? null) : null,
    classTeacherName: c.submittedByStaffId ? (staffName.get(c.submittedByStaffId) ?? null) : null,
  }));
}

export function mapReportCard(c: ReportCard, names: CardNames = NO_NAMES): ReportCardDto {
  return {
    id: c.id,
    schoolId: c.schoolId,
    enrollmentId: c.enrollmentId,
    kind: c.kind,
    examId: c.examId,
    termId: c.termId,
    version: c.version,
    status: c.status,
    classTeacherRemark: c.classTeacherRemark,
    principalRemark: c.principalRemark,
    promotionDecision: c.promotionDecision,
    examName: names.examName,
    termName: names.termName,
    classTeacherName: names.classTeacherName,
    rank: c.rank,
    rankScope: c.rankScope,
    cohortSize: c.cohortSize,
    attendancePercentage: c.attendancePercentage,
    presentCount: c.presentCount,
    absentCount: c.absentCount,
    lateCount: c.lateCount,
    halfDayCount: c.halfDayCount,
    leaveCount: c.leaveCount,
    workingDays: c.workingDays,
    gpaSnapshot: c.gpaSnapshot,
    cgpaSnapshot: c.cgpaSnapshot,
    pdfPath: c.pdfPath,
    createdByStaffId: c.createdByStaffId,
    submittedByStaffId: c.submittedByStaffId,
    submittedAt: iso(c.submittedAt),
    approvedByStaffId: c.approvedByStaffId,
    approvedAt: iso(c.approvedAt),
    publishedByStaffId: c.publishedByStaffId,
    publishedAt: iso(c.publishedAt),
    reopenedByStaffId: c.reopenedByStaffId,
    reopenedAt: iso(c.reopenedAt),
    reopenReason: c.reopenReason,
    revokedByStaffId: c.revokedByStaffId,
    revokedAt: iso(c.revokedAt),
    revokeReason: c.revokeReason,
  };
}
