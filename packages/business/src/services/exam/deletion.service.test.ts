import { ConflictError } from "@repo/core";
import type { ExamDeletionRef, Repositories } from "@repo/db";
import { createNotificationService } from "@repo/notifications";
import { describe, expect, it, vi } from "vitest";

import type { Principal } from "../../authorization";
import type { ServiceContext } from "../../context";

import { deleteAssessment, deleteExam, deleteExamSection } from "./deletion.service";

const admin: Principal = {
  userId: "u-admin",
  schoolId: "s-1",
  role: "OFFICE_ADMIN",
  status: "ACTIVE",
};

const draftRef: ExamDeletionRef = { examId: "ex-1", schoolId: "s-1", isPublished: false };
const publishedRef: ExamDeletionRef = { examId: "ex-1", schoolId: "s-1", isPublished: true };

/** Happy-path exam repo (draft, no locked section); each test overrides per case. */
function makeRepos(over: Partial<Record<string, unknown>> = {}) {
  return {
    audit: { record: vi.fn(async (): Promise<void> => undefined) },
    exams: {
      findDeletionRefById: vi.fn(async (): Promise<ExamDeletionRef | null> => draftRef),
      findDeletionRefByAssessment: vi.fn(async (): Promise<ExamDeletionRef | null> => draftRef),
      findDeletionRefByExamSection: vi.fn(async (): Promise<ExamDeletionRef | null> => draftRef),
      hasLockedSection: vi.fn(async (): Promise<boolean> => false),
      deleteExam: vi.fn(async (): Promise<void> => undefined),
      deleteAssessment: vi.fn(async (): Promise<void> => undefined),
      deleteExamSection: vi.fn(async (): Promise<void> => undefined),
      ...over,
    },
  };
}

function makeCtx(repos = makeRepos()) {
  const repositories = repos as unknown as Repositories;
  const ctx: ServiceContext = {
    user: admin,
    repositories,
    notifications: createNotificationService([]),
    withTransaction: <T>(fn: (r: Repositories) => Promise<T>) => fn(repositories),
  };
  return { ctx, repos };
}

describe("M5 published-data deletion guard (ADR-012 R5)", () => {
  it("deleting a DRAFT exam succeeds", async () => {
    const { ctx, repos } = makeCtx();
    await expect(deleteExam(ctx, "ex-1")).resolves.toBeUndefined();
    expect(repos.exams.deleteExam).toHaveBeenCalledTimes(1);
  });

  it("deleting a PUBLISHED exam returns Conflict", async () => {
    const { ctx, repos } = makeCtx(
      makeRepos({
        findDeletionRefById: vi.fn(async (): Promise<ExamDeletionRef | null> => publishedRef),
      }),
    );
    await expect(deleteExam(ctx, "ex-1")).rejects.toBeInstanceOf(ConflictError);
    expect(repos.exams.deleteExam).not.toHaveBeenCalled();
  });

  it("deleting an exam with a LOCKED section returns Conflict", async () => {
    const { ctx, repos } = makeCtx(
      makeRepos({
        hasLockedSection: vi.fn(async (): Promise<boolean> => true),
      }),
    );
    await expect(deleteExam(ctx, "ex-1")).rejects.toBeInstanceOf(ConflictError);
    expect(repos.exams.deleteExam).not.toHaveBeenCalled();
  });

  it("deleting an ASSESSMENT of a published exam returns Conflict (cannot bypass the guard)", async () => {
    const { ctx, repos } = makeCtx(
      makeRepos({
        findDeletionRefByAssessment: vi.fn(
          async (): Promise<ExamDeletionRef | null> => publishedRef,
        ),
      }),
    );
    await expect(deleteAssessment(ctx, "as-1")).rejects.toBeInstanceOf(ConflictError);
    expect(repos.exams.deleteAssessment).not.toHaveBeenCalled();
  });

  it("deleting an EXAM SECTION of a published exam returns Conflict (cannot bypass the guard)", async () => {
    const { ctx, repos } = makeCtx(
      makeRepos({
        findDeletionRefByExamSection: vi.fn(
          async (): Promise<ExamDeletionRef | null> => publishedRef,
        ),
      }),
    );
    await expect(deleteExamSection(ctx, "es-1")).rejects.toBeInstanceOf(ConflictError);
    expect(repos.exams.deleteExamSection).not.toHaveBeenCalled();
  });

  it("writes NO audit when a deletion is rejected", async () => {
    const { ctx, repos } = makeCtx(
      makeRepos({
        findDeletionRefById: vi.fn(async (): Promise<ExamDeletionRef | null> => publishedRef),
      }),
    );
    await expect(deleteExam(ctx, "ex-1")).rejects.toBeInstanceOf(ConflictError);
    expect(repos.audit.record).not.toHaveBeenCalled();
  });

  it("writes EXACTLY ONE audit on a successful deletion", async () => {
    const { ctx, repos } = makeCtx();
    await deleteExam(ctx, "ex-1");
    expect(repos.audit.record).toHaveBeenCalledTimes(1);
    expect(repos.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "EXAM_DELETE", entityType: "Exam", entityId: "ex-1" }),
    );
  });
});
