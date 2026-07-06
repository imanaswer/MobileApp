import type { LeaveRequest } from "@prisma/client";

import type { DbClient } from "../db-client";

export type { LeaveRequest };

export type LeaveRequestStatusKey = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export interface CreateLeaveRequestInput {
  schoolId: string;
  enrollmentId: string;
  parentId: string;
  fromDate: Date;
  toDate: Date;
  reason: string;
}

export interface DecideLeaveRequestInput {
  status: LeaveRequestStatusKey;
  decidedByUserId?: string | null | undefined;
  decidedAt?: Date | null | undefined;
  decisionNote?: string | null | undefined;
}

/** Optional narrowing for list queries (row scope is applied by the service). */
export interface LeaveRequestFilter {
  status?: LeaveRequestStatusKey | undefined;
  enrollmentId?: string | undefined;
  enrollmentIds?: readonly string[] | undefined;
  parentId?: string | undefined;
}

/** Persistence for `LeaveRequest` (ADR-003, ADR-011). No authorization/business rules. */
export interface LeaveRequestRepository {
  findById(id: string): Promise<LeaveRequest | null>;
  list(schoolId: string, filter?: LeaveRequestFilter): Promise<LeaveRequest[]>;
  /** A live (PENDING/APPROVED) leave intersecting [from, to] — clean 409 before the EXCLUDE. */
  findLiveOverlap(
    enrollmentId: string,
    fromDate: Date,
    toDate: Date,
    excludeId?: string,
  ): Promise<LeaveRequest | null>;
  /** APPROVED leaves of these enrollments covering the given date (session prefill). */
  listApprovedCovering(enrollmentIds: readonly string[], date: Date): Promise<LeaveRequest[]>;
  create(input: CreateLeaveRequestInput): Promise<LeaveRequest>;
  decide(id: string, data: DecideLeaveRequestInput): Promise<LeaveRequest>;
}

export function createLeaveRequestRepository(client: DbClient): LeaveRequestRepository {
  return {
    findById: (id) => client.leaveRequest.findUnique({ where: { id } }),
    list: (schoolId, filter) =>
      client.leaveRequest.findMany({
        where: {
          schoolId,
          ...(filter?.status ? { status: filter.status } : {}),
          ...(filter?.enrollmentId ? { enrollmentId: filter.enrollmentId } : {}),
          ...(filter?.enrollmentIds ? { enrollmentId: { in: [...filter.enrollmentIds] } } : {}),
          ...(filter?.parentId ? { parentId: filter.parentId } : {}),
        },
        orderBy: { createdAt: "desc" },
      }),
    findLiveOverlap: (enrollmentId, fromDate, toDate, excludeId) =>
      client.leaveRequest.findFirst({
        where: {
          enrollmentId,
          status: { in: ["PENDING", "APPROVED"] },
          fromDate: { lte: toDate },
          toDate: { gte: fromDate },
          ...(excludeId ? { NOT: { id: excludeId } } : {}),
        },
      }),
    listApprovedCovering: (enrollmentIds, date) =>
      enrollmentIds.length === 0
        ? Promise.resolve([])
        : client.leaveRequest.findMany({
            where: {
              enrollmentId: { in: [...enrollmentIds] },
              status: "APPROVED",
              fromDate: { lte: date },
              toDate: { gte: date },
            },
          }),
    create: (input) => client.leaveRequest.create({ data: input }),
    decide: (id, data) =>
      client.leaveRequest.update({
        where: { id },
        data: {
          status: data.status,
          ...(data.decidedByUserId !== undefined ? { decidedByUserId: data.decidedByUserId } : {}),
          ...(data.decidedAt !== undefined ? { decidedAt: data.decidedAt } : {}),
          ...(data.decisionNote !== undefined ? { decisionNote: data.decisionNote } : {}),
        },
      }),
  };
}
