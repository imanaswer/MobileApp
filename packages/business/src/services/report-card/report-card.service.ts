import { PERMISSIONS } from "@repo/constants";
import { ConflictError, ForbiddenError, ValidationError } from "@repo/core";
import type { ReportCardKind } from "@repo/db";
import type {
  PromotionDecisionKey,
  ReportCardDto,
  ReportCardKindKey,
  SectionReportCardRowDto,
} from "@repo/types";

import { assertCan } from "../../authorization";
import type { ServiceContext } from "../../context";
import { isFullAccess, parentChildIds } from "../people/scope";

import {
  assertClassTeacherOfEnrollment,
  assertReportCardReadScope,
  assertScopeYearMatches,
  isParent,
  loadEnrollmentInSchool,
  loadReportCardInSchool,
  mapReportCard,
  recordAudit,
  resolveActingStaffId,
  resolveCardNames,
  resolveCardNamesBatch,
} from "./scope";
import { assembleSnapshot } from "./snapshot";

/** Non-terminal states — a card that still "occupies" its scope (blocks a second live card). */
const LIVE_STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "PUBLISHED"] as const;
/** Pre-publish states an admin may still edit the authored fields in. */
const PRE_PUBLISH = ["DRAFT", "SUBMITTED", "APPROVED"] as const;
/** The snapshot payload, all null — used to clear a card's frozen values on reopen. */
const CLEARED_SNAPSHOT = {
  rank: null,
  rankScope: null,
  cohortSize: null,
  attendancePercentage: null,
  presentCount: null,
  absentCount: null,
  lateCount: null,
  halfDayCount: null,
  leaveCount: null,
  workingDays: null,
  gpaSnapshot: null,
  cgpaSnapshot: null,
  pdfPath: null,
} as const;

/** Normalize the scope FKs to the kind (EXAM→examId only, TERM→termId only, ANNUAL→neither). */
function scopeForKind(
  kind: ReportCardKind,
  examId?: string | null,
  termId?: string | null,
): { examId: string | null; termId: string | null } {
  return {
    examId: kind === "EXAM" ? (examId ?? null) : null,
    termId: kind === "TERM" ? (termId ?? null) : null,
  };
}

export interface GenerateReportCardInput {
  enrollmentId: string;
  kind: ReportCardKindKey;
  examId?: string | null | undefined;
  termId?: string | null | undefined;
}

/**
 * Generate a DRAFT card for a (enrollment, kind, scope) — admin. Idempotent: if a
 * DRAFT already exists for the scope it is returned (ADR-014 §4 "regeneration upserts"),
 * never a second row (the one-active-draft-per-scope service invariant). A live
 * SUBMITTED/APPROVED/PUBLISHED card blocks generation (correct or reopen it instead).
 * `version` continues past any terminal (SUPERSEDED/REVOKED) rows so the per-scope
 * version index never collides. Snapshot stays empty until approve.
 */
export async function generateReportCard(
  ctx: ServiceContext,
  input: GenerateReportCardInput,
): Promise<ReportCardDto> {
  assertCan(ctx.user, PERMISSIONS.REPORT_CARD_MANAGE);
  const staffId = await resolveActingStaffId(ctx);
  const { examId, termId } = scopeForKind(input.kind, input.examId, input.termId);
  await assertScopeYearMatches(ctx, {
    enrollmentId: input.enrollmentId,
    kind: input.kind,
    examId,
    termId,
  });

  const versions = await ctx.repositories.reportCards.findScopeVersions(
    input.enrollmentId,
    input.kind,
    examId,
    termId,
  );
  const existingDraft = versions.find((v) => v.status === "DRAFT");
  if (existingDraft) {
    return mapReportCard(existingDraft); // idempotent
  }
  if (versions.some((v) => (LIVE_STATUSES as readonly string[]).includes(v.status))) {
    throw new ConflictError(
      "A report card already exists for this scope; correct or reopen it instead",
    );
  }
  const nextVersion = versions.reduce((m, v) => Math.max(m, v.version), 0) + 1;

  return ctx.withTransaction(async (repos) => {
    const created = await repos.reportCards.create({
      schoolId: ctx.user.schoolId,
      enrollmentId: input.enrollmentId,
      kind: input.kind,
      examId,
      termId,
      version: nextVersion,
      createdByStaffId: staffId,
    });
    await recordAudit(ctx, repos, {
      action: "REPORT_CARD_GENERATE",
      entityType: "ReportCard",
      entityId: created.id,
      after: { kind: created.kind, version: created.version, status: created.status },
    });
    return mapReportCard(created);
  });
}

/**
 * The class teacher drafts the teacher remark (DRAFT only). Gated by the shared
 * assertClassTeacherOfEnrollment scope — REPORT_CARD_REMARK alone is held by every
 * TEACHER, so this predicate is what refuses a subject teacher of the same section (R1).
 */
export async function draftClassTeacherRemark(
  ctx: ServiceContext,
  input: { reportCardId: string; remark: string },
): Promise<ReportCardDto> {
  assertCan(ctx.user, PERMISSIONS.REPORT_CARD_REMARK);
  const card = await loadReportCardInSchool(ctx, input.reportCardId);
  await assertClassTeacherOfEnrollment(ctx, card.enrollmentId);
  if (card.status !== "DRAFT") {
    throw new ConflictError("The teacher remark can only be edited while the card is a draft");
  }
  return ctx.withTransaction(async (repos) => {
    const updated = await repos.reportCards.updateContent(input.reportCardId, ["DRAFT"], {
      classTeacherRemark: input.remark,
    });
    if (!updated) {
      throw new ConflictError("The card is no longer a draft");
    }
    await recordAudit(ctx, repos, {
      action: "REPORT_CARD_REMARK",
      entityType: "ReportCard",
      entityId: updated.id,
    });
    return mapReportCard(updated);
  });
}

/** Admin edits the principal remark / promotion decision — pre-publish only (published is immutable). */
export async function editReportCard(
  ctx: ServiceContext,
  input: {
    reportCardId: string;
    principalRemark?: string | null | undefined;
    promotionDecision?: PromotionDecisionKey | null | undefined;
  },
): Promise<ReportCardDto> {
  assertCan(ctx.user, PERMISSIONS.REPORT_CARD_MANAGE);
  const card = await loadReportCardInSchool(ctx, input.reportCardId);
  if (!(PRE_PUBLISH as readonly string[]).includes(card.status)) {
    throw new ConflictError("A published card is immutable; correct it to change anything");
  }
  if (input.principalRemark === undefined && input.promotionDecision === undefined) {
    throw new ValidationError("Nothing to update");
  }
  return ctx.withTransaction(async (repos) => {
    const updated = await repos.reportCards.updateContent(input.reportCardId, PRE_PUBLISH, {
      ...(input.principalRemark !== undefined ? { principalRemark: input.principalRemark } : {}),
      ...(input.promotionDecision !== undefined
        ? { promotionDecision: input.promotionDecision }
        : {}),
    });
    if (!updated) {
      throw new ConflictError("The card is no longer editable");
    }
    await recordAudit(ctx, repos, {
      action: "REPORT_CARD_EDIT",
      entityType: "ReportCard",
      entityId: updated.id,
    });
    return mapReportCard(updated);
  });
}

/** DRAFT → SUBMITTED — the class teacher submits for review. Gated by the class-teacher scope (R1). */
export async function submitReportCard(
  ctx: ServiceContext,
  reportCardId: string,
): Promise<ReportCardDto> {
  assertCan(ctx.user, PERMISSIONS.REPORT_CARD_REMARK);
  const staffId = await resolveActingStaffId(ctx);
  const card = await loadReportCardInSchool(ctx, reportCardId);
  await assertClassTeacherOfEnrollment(ctx, card.enrollmentId);
  if (card.status !== "DRAFT") {
    throw new ConflictError("Only a draft card can be submitted for review");
  }
  return ctx.withTransaction(async (repos) => {
    const submitted = await repos.reportCards.transition(reportCardId, "DRAFT", {
      status: "SUBMITTED",
      submittedByStaffId: staffId,
      submittedAt: new Date(),
    });
    if (!submitted) {
      throw new ConflictError("The card is no longer a draft");
    }
    await recordAudit(ctx, repos, {
      action: "REPORT_CARD_SUBMIT",
      entityType: "ReportCard",
      entityId: reportCardId,
      before: { status: "DRAFT" },
      after: { status: "SUBMITTED" },
    });
    return mapReportCard(submitted);
  });
}

/**
 * SUBMITTED → APPROVED — admin approval FREEZES the snapshot (attendance %, rank, GPA)
 * and stamps approvedAt. The card MUST be SUBMITTED — approving a DRAFT (skip-state) is
 * rejected, so every card passes through the class-teacher review gate before approval.
 * Guarded conditional update (WHERE status='SUBMITTED') → concurrent approves cannot both
 * win. Re-validates year consistency before freezing.
 */
export async function approveReportCard(
  ctx: ServiceContext,
  reportCardId: string,
): Promise<ReportCardDto> {
  assertCan(ctx.user, PERMISSIONS.REPORT_CARD_MANAGE);
  const staffId = await resolveActingStaffId(ctx);
  const card = await loadReportCardInSchool(ctx, reportCardId);
  if (card.status !== "SUBMITTED") {
    throw new ConflictError("Only a submitted card can be approved");
  }
  const enrollment = await assertScopeYearMatches(ctx, card);
  const snapshot = await assembleSnapshot(ctx, enrollment, card.kind, card.termId);

  return ctx.withTransaction(async (repos) => {
    const approved = await repos.reportCards.transition(reportCardId, "SUBMITTED", {
      status: "APPROVED",
      approvedByStaffId: staffId,
      approvedAt: new Date(),
      ...snapshot,
    });
    if (!approved) {
      throw new ConflictError("The card is no longer awaiting approval");
    }
    await recordAudit(ctx, repos, {
      action: "REPORT_CARD_APPROVE",
      entityType: "ReportCard",
      entityId: reportCardId,
      before: { status: card.status },
      after: { status: "APPROVED", rank: snapshot.rank, gpa: snapshot.gpaSnapshot },
    });
    return mapReportCard(approved);
  });
}

/**
 * SUBMITTED/APPROVED → DRAFT — the audited reopen. Clears the submit + approve stamps
 * AND the frozen snapshot (a stale rank on a DRAFT would mislead; the DB CHECK forces
 * approvedAt null anyway). Requires a reason (homework idiom).
 */
export async function reopenReportCard(
  ctx: ServiceContext,
  input: { reportCardId: string; reason: string },
): Promise<ReportCardDto> {
  assertCan(ctx.user, PERMISSIONS.REPORT_CARD_MANAGE);
  const staffId = await resolveActingStaffId(ctx);
  const card = await loadReportCardInSchool(ctx, input.reportCardId);
  if (card.status !== "SUBMITTED" && card.status !== "APPROVED") {
    throw new ConflictError("Only a submitted or approved card can be reopened");
  }
  if (!input.reason.trim()) {
    throw new ValidationError("A reopen reason is required");
  }
  await assertScopeYearMatches(ctx, card);

  return ctx.withTransaction(async (repos) => {
    const reopened = await repos.reportCards.transition(input.reportCardId, card.status, {
      status: "DRAFT",
      submittedByStaffId: null,
      submittedAt: null,
      approvedByStaffId: null,
      approvedAt: null,
      reopenedByStaffId: staffId,
      reopenedAt: new Date(),
      reopenReason: input.reason,
      ...CLEARED_SNAPSHOT,
    });
    if (!reopened) {
      throw new ConflictError("The card is no longer reopenable");
    }
    await recordAudit(ctx, repos, {
      action: "REPORT_CARD_REOPEN",
      entityType: "ReportCard",
      entityId: input.reportCardId,
      before: { status: card.status },
      after: { status: "DRAFT", reason: input.reason },
    });
    return mapReportCard(reopened);
  });
}

/**
 * APPROVED → PUBLISHED — release to parents, folding in supersession (R3). Any existing
 * live PUBLISHED card in the same scope is superseded FIRST, then this card is published,
 * in ONE transaction — so there is never momentarily two PUBLISHED rows (the partial-unique
 * also guards it). First publish (no prior) and correction publish share this path.
 */
export async function publishReportCard(
  ctx: ServiceContext,
  reportCardId: string,
): Promise<ReportCardDto> {
  assertCan(ctx.user, PERMISSIONS.REPORT_CARD_MANAGE);
  const staffId = await resolveActingStaffId(ctx);
  const card = await loadReportCardInSchool(ctx, reportCardId);
  if (card.status !== "APPROVED") {
    throw new ConflictError("Only an approved card can be published");
  }
  await assertScopeYearMatches(ctx, card);
  const versions = await ctx.repositories.reportCards.findScopeVersions(
    card.enrollmentId,
    card.kind,
    card.examId,
    card.termId,
  );
  const priorPublished = versions.find((v) => v.status === "PUBLISHED" && v.id !== card.id);

  return ctx.withTransaction(async (repos) => {
    if (priorPublished) {
      const superseded = await repos.reportCards.transition(priorPublished.id, "PUBLISHED", {
        status: "SUPERSEDED",
      });
      if (!superseded) {
        throw new ConflictError("The prior published card changed; retry the correction");
      }
      await recordAudit(ctx, repos, {
        action: "REPORT_CARD_SUPERSEDE",
        entityType: "ReportCard",
        entityId: priorPublished.id,
        before: { status: "PUBLISHED", version: priorPublished.version },
        after: { status: "SUPERSEDED", supersededByVersion: card.version },
      });
    }
    const published = await repos.reportCards.transition(reportCardId, "APPROVED", {
      status: "PUBLISHED",
      publishedByStaffId: staffId,
      publishedAt: new Date(),
    });
    if (!published) {
      throw new ConflictError("The card is no longer approved");
    }
    await recordAudit(ctx, repos, {
      action: "REPORT_CARD_PUBLISH",
      entityType: "ReportCard",
      entityId: reportCardId,
      before: { status: "APPROVED" },
      after: { status: "PUBLISHED", version: card.version },
    });
    return mapReportCard(published);
  });
}

/** PUBLISHED → REVOKED — pull a published card from parents (no replacement). Requires a reason. */
export async function revokeReportCard(
  ctx: ServiceContext,
  input: { reportCardId: string; reason: string },
): Promise<ReportCardDto> {
  assertCan(ctx.user, PERMISSIONS.REPORT_CARD_MANAGE);
  const staffId = await resolveActingStaffId(ctx);
  const card = await loadReportCardInSchool(ctx, input.reportCardId);
  if (card.status !== "PUBLISHED") {
    throw new ConflictError("Only a published card can be revoked");
  }
  if (!input.reason.trim()) {
    throw new ValidationError("A revoke reason is required");
  }
  await assertScopeYearMatches(ctx, card);

  return ctx.withTransaction(async (repos) => {
    const revoked = await repos.reportCards.transition(input.reportCardId, "PUBLISHED", {
      status: "REVOKED",
      revokedByStaffId: staffId,
      revokedAt: new Date(),
      revokeReason: input.reason,
    });
    if (!revoked) {
      throw new ConflictError("The card is no longer published");
    }
    await recordAudit(ctx, repos, {
      action: "REPORT_CARD_REVOKE",
      entityType: "ReportCard",
      entityId: input.reportCardId,
      before: { status: "PUBLISHED" },
      after: { status: "REVOKED", reason: input.reason },
    });
    return mapReportCard(revoked);
  });
}

/**
 * Start a correction (R3): spawn a NEW DRAFT (version+1) from a PUBLISHED card, copying
 * its authored fields as the starting point. The old card stays PUBLISHED until the new
 * one is published (publish folds in the supersession). Refuses if a correction is already
 * in progress for the scope (the one-active-draft invariant).
 */
export async function correctReportCard(
  ctx: ServiceContext,
  publishedReportCardId: string,
): Promise<ReportCardDto> {
  assertCan(ctx.user, PERMISSIONS.REPORT_CARD_MANAGE);
  const staffId = await resolveActingStaffId(ctx);
  const card = await loadReportCardInSchool(ctx, publishedReportCardId);
  if (card.status !== "PUBLISHED") {
    throw new ConflictError("Only a published card can be corrected");
  }
  await assertScopeYearMatches(ctx, card);

  const versions = await ctx.repositories.reportCards.findScopeVersions(
    card.enrollmentId,
    card.kind,
    card.examId,
    card.termId,
  );
  if (
    versions.some(
      (v) => v.status === "DRAFT" || v.status === "SUBMITTED" || v.status === "APPROVED",
    )
  ) {
    throw new ConflictError("A correction is already in progress for this card");
  }
  const nextVersion = versions.reduce((m, v) => Math.max(m, v.version), 0) + 1;

  return ctx.withTransaction(async (repos) => {
    const draft = await repos.reportCards.create({
      schoolId: ctx.user.schoolId,
      enrollmentId: card.enrollmentId,
      kind: card.kind,
      examId: card.examId,
      termId: card.termId,
      version: nextVersion,
      createdByStaffId: staffId,
      classTeacherRemark: card.classTeacherRemark,
      principalRemark: card.principalRemark,
      promotionDecision: card.promotionDecision,
    });
    await recordAudit(ctx, repos, {
      action: "REPORT_CARD_CORRECT",
      entityType: "ReportCard",
      entityId: draft.id,
      before: { correctsVersion: card.version },
      after: { version: draft.version, status: draft.status },
    });
    return mapReportCard(draft);
  });
}

/* ---- reads ---- */

/** One card, read-scoped (admin any / class-teacher own-section / parent own-child PUBLISHED). */
export async function getReportCard(ctx: ServiceContext, id: string): Promise<ReportCardDto> {
  assertCan(ctx.user, PERMISSIONS.REPORT_CARD_READ);
  const card = await loadReportCardInSchool(ctx, id);
  await assertReportCardReadScope(ctx, card);
  return mapReportCard(card, await resolveCardNames(ctx, card));
}

/**
 * A student's card trail for one enrollment (the Q6 year-over-year read): admin/class-
 * teacher → all versions; parent → own child, PUBLISHED only.
 */
export async function listReportCardsForEnrollment(
  ctx: ServiceContext,
  enrollmentId: string,
): Promise<ReportCardDto[]> {
  assertCan(ctx.user, PERMISSIONS.REPORT_CARD_READ);
  const enrollment = await loadEnrollmentInSchool(ctx, enrollmentId);

  if (isParent(ctx)) {
    const childIds = await parentChildIds(ctx);
    if (!childIds.includes(enrollment.studentId)) {
      return [];
    }
    const rows = await ctx.repositories.reportCards.listPublishedByEnrollment(enrollmentId);
    const names = await resolveCardNamesBatch(ctx, rows);
    return rows.map((c, i) => mapReportCard(c, names[i]));
  }
  if (!isFullAccess(ctx)) {
    // TEACHER — only the assigned class teacher of this enrollment.
    await assertClassTeacherOfEnrollment(ctx, enrollmentId);
  }
  const rows = await ctx.repositories.reportCards.listByEnrollment(enrollmentId);
  const names = await resolveCardNamesBatch(ctx, rows);
  return rows.map((c, i) => mapReportCard(c, names[i]));
}

/**
 * Every report card in a section for a year (admin any; the assigned CLASS TEACHER of
 * the section). The gate is the SAME one listForEnrollment uses (isFullAccess OR
 * ClassTeacherAssignment holder), lifted from enrollment grain to section grain — no
 * new authorization rule. It grants NO new visibility: a class teacher can already read
 * any-status section cards one-by-one via listForEnrollment; this only batches the
 * enumeration. Exists because no people/enrollment read enumerates a section under
 * ClassTeacherAssignment scope (they are all TeacherAssignment-scoped). Reuses existing
 * repo methods only.
 */
export async function listReportCardsForSection(
  ctx: ServiceContext,
  input: { academicYearId: string; sectionId: string },
): Promise<SectionReportCardRowDto[]> {
  assertCan(ctx.user, PERMISSIONS.REPORT_CARD_READ);
  if (!isFullAccess(ctx)) {
    const classTeacher = await ctx.repositories.classTeacherAssignments.findBySectionYear(
      input.academicYearId,
      input.sectionId,
    );
    if (!classTeacher || classTeacher.teacherId !== ctx.user.userId) {
      throw new ForbiddenError("Out of scope for this section");
    }
  }
  const enrollments = await ctx.repositories.enrollments.listBySection(
    input.academicYearId,
    input.sectionId,
  );
  // Enrollment → { studentName, rollNo } (batch the student-name join; ADR-016).
  const students = await ctx.repositories.students.listByIds([
    ...new Set(enrollments.map((e) => e.studentId)),
  ]);
  const studentName = new Map(students.map((s) => [s.id, `${s.firstName} ${s.lastName}`.trim()]));
  const meta = new Map(
    enrollments.map((e) => [
      e.id,
      { studentName: studentName.get(e.studentId) ?? "—", rollNo: e.rollNo },
    ]),
  );

  const perEnrollment = await Promise.all(
    enrollments.map((e) => ctx.repositories.reportCards.listByEnrollment(e.id)),
  );
  const cards = perEnrollment.flat();
  const names = await resolveCardNamesBatch(ctx, cards);
  return cards.map((c, i) => ({
    ...mapReportCard(c, names[i]),
    ...(meta.get(c.enrollmentId) ?? { studentName: "—", rollNo: null }),
  }));
}
