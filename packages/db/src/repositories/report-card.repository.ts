import type {
  PromotionDecision,
  RankScope,
  ReportCard,
  ReportCardKind,
  ReportCardStatus,
} from "@prisma/client";

import type { DbClient } from "../db-client";

export type { ReportCard, ReportCardKind, ReportCardStatus, RankScope, PromotionDecision };

export interface CreateReportCardInput {
  schoolId: string;
  enrollmentId: string;
  kind: ReportCardKind;
  examId?: string | null;
  termId?: string | null;
  version: number;
  createdByStaffId: string;
  // optional seed (a correction copies the prior card's authored fields into the new DRAFT)
  classTeacherRemark?: string | null;
  principalRemark?: string | null;
  promotionDecision?: PromotionDecision | null;
}

/** DRAFT/pre-publish authored-field edit (remarks + promotion). */
export interface UpdateReportCardContentInput {
  classTeacherRemark?: string | null;
  principalRemark?: string | null;
  promotionDecision?: PromotionDecision | null;
}

/** Fields a guarded lifecycle transition may stamp (submit/approve/publish/reopen/revoke). */
export interface TransitionReportCardInput {
  status: ReportCardStatus;
  submittedByStaffId?: string | null;
  submittedAt?: Date | null;
  approvedByStaffId?: string | null;
  approvedAt?: Date | null;
  publishedByStaffId?: string | null;
  publishedAt?: Date | null;
  reopenedByStaffId?: string | null;
  reopenedAt?: Date | null;
  reopenReason?: string | null;
  revokedByStaffId?: string | null;
  revokedAt?: Date | null;
  revokeReason?: string | null;
  // snapshot payload — set at approve, cleared (to null) at reopen
  rank?: number | null;
  rankScope?: RankScope | null;
  cohortSize?: number | null;
  attendancePercentage?: number | null;
  presentCount?: number | null;
  absentCount?: number | null;
  lateCount?: number | null;
  halfDayCount?: number | null;
  leaveCount?: number | null;
  workingDays?: number | null;
  gpaSnapshot?: number | null;
  cgpaSnapshot?: number | null;
  pdfPath?: string | null;
}

/**
 * ReportCard persistence (M7, ADR-014). Persistence ONLY — year-consistency,
 * scope gating, snapshot assembly, and lifecycle rules live in the business layer.
 * Lifecycle transitions are guarded conditional updates (the M5/M6 idiom): they
 * apply only from the expected `fromStatus`, so a lost race is a no-op (null),
 * never a double-transition. Nullable `examId`/`termId` in a scope lookup match by
 * equality (Prisma treats an explicit `null` filter as IS NULL).
 */
export interface ReportCardRepository {
  findById(id: string): Promise<ReportCard | null>;
  /** A student's card trail for one enrollment (year-over-year read), newest-version first. */
  listByEnrollment(enrollmentId: string): Promise<ReportCard[]>;
  /** Parent read — PUBLISHED cards only for an enrollment. */
  listPublishedByEnrollment(enrollmentId: string): Promise<ReportCard[]>;
  /** Every version in a (enrollment, kind, scope) — for version bump, live-published lookup, and the active-draft guard. */
  findScopeVersions(
    enrollmentId: string,
    kind: ReportCardKind,
    examId: string | null,
    termId: string | null,
  ): Promise<ReportCard[]>;
  create(input: CreateReportCardInput): Promise<ReportCard>;
  /** Authored-field edit, guarded to `fromStatuses` — null if the card left those states. */
  updateContent(
    id: string,
    fromStatuses: readonly ReportCardStatus[],
    data: UpdateReportCardContentInput,
  ): Promise<ReportCard | null>;
  /** Guarded lifecycle transition — null if the card is no longer `fromStatus`. */
  transition(
    id: string,
    fromStatus: ReportCardStatus,
    data: TransitionReportCardInput,
  ): Promise<ReportCard | null>;
  /** Persist the rendered PDF's storage PATH (ADR-026). Unguarded — best-effort, post-publish. */
  setPdfPath(id: string, pdfPath: string): Promise<void>;
}

export function createReportCardRepository(client: DbClient): ReportCardRepository {
  const spread = (data: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));

  return {
    findById: (id) => client.reportCard.findUnique({ where: { id } }),
    listByEnrollment: (enrollmentId) =>
      client.reportCard.findMany({
        where: { enrollmentId },
        orderBy: [{ kind: "asc" }, { version: "desc" }],
      }),
    listPublishedByEnrollment: (enrollmentId) =>
      client.reportCard.findMany({
        where: { enrollmentId, status: "PUBLISHED" },
        orderBy: [{ kind: "asc" }, { version: "desc" }],
      }),
    findScopeVersions: (enrollmentId, kind, examId, termId) =>
      client.reportCard.findMany({
        where: { enrollmentId, kind, examId, termId },
        orderBy: { version: "desc" },
      }),
    create: (input) =>
      client.reportCard.create({
        data: {
          schoolId: input.schoolId,
          enrollmentId: input.enrollmentId,
          kind: input.kind,
          examId: input.examId ?? null,
          termId: input.termId ?? null,
          version: input.version,
          createdByStaffId: input.createdByStaffId,
          classTeacherRemark: input.classTeacherRemark ?? null,
          principalRemark: input.principalRemark ?? null,
          promotionDecision: input.promotionDecision ?? null,
        },
      }),
    updateContent: async (id, fromStatuses, data) => {
      const res = await client.reportCard.updateMany({
        where: { id, status: { in: [...fromStatuses] } },
        data: spread({
          classTeacherRemark: data.classTeacherRemark,
          principalRemark: data.principalRemark,
          promotionDecision: data.promotionDecision,
        }),
      });
      return res.count === 0 ? null : client.reportCard.findUnique({ where: { id } });
    },
    transition: async (id, fromStatus, data) => {
      const { status, ...rest } = data;
      const res = await client.reportCard.updateMany({
        where: { id, status: fromStatus },
        data: { status, ...spread(rest) },
      });
      return res.count === 0 ? null : client.reportCard.findUnique({ where: { id } });
    },
    setPdfPath: async (id, pdfPath) => {
      await client.reportCard.update({ where: { id }, data: { pdfPath } });
    },
  };
}
