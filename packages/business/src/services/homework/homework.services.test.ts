import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@repo/core";
import type { Enrollment, Homework, HomeworkSubmission, Repositories } from "@repo/db";
import { createNotificationService } from "@repo/notifications";
import { describe, expect, it, vi } from "vitest";

import type { Principal } from "../../authorization";
import type { ServiceContext } from "../../context";
import type { StoragePort } from "../people/document-storage.service";

import {
  addHomeworkAttachment,
  mintHomeworkAttachmentDownloadUrl,
  mintHomeworkUploadUrl,
} from "./attachment.service";
import { listFeedback, reviewSubmission } from "./feedback.service";
import {
  closeHomework,
  createHomework,
  deleteHomework,
  getHomework,
  listHomework,
  publishHomework,
  reopenHomework,
  updateHomework,
} from "./homework.service";
import {
  mintSubmissionAttachmentDownloadUrl,
  mintSubmissionUploadUrl,
} from "./submission-attachment.service";
import {
  getSubmission,
  listSubmissions,
  resubmitHomework,
  submissionsForEnrollment,
  submitHomework,
} from "./submission.service";

/**
 * Business coverage for the M6 homework domain (Step 9, ADR-013): the lifecycle +
 * derived-ownership scope, the §7 cross-table submission invariants, the §10 parent
 * or-clause (R3), guarded transitions/conflicts, the empty-submission guard, the
 * isLate snapshot, and the storage-mint authz (mock StoragePort, M3 bar — the byte
 * round-trip is a provisioning-runbook step). Review/resubmit races: see
 * homework.concurrency.test.
 */

const superAdmin: Principal = {
  userId: "u-admin",
  schoolId: "s-1",
  role: "SUPER_ADMIN",
  status: "ACTIVE",
};
const teacher: Principal = {
  userId: "u-teacher",
  schoolId: "s-1",
  role: "TEACHER",
  status: "ACTIVE",
};
const otherTeacher: Principal = {
  userId: "u-other",
  schoolId: "s-1",
  role: "TEACHER",
  status: "ACTIVE",
};
const parent: Principal = { userId: "u-parent", schoolId: "s-1", role: "PARENT", status: "ACTIVE" };
const accountant: Principal = {
  userId: "u-acc",
  schoolId: "s-1",
  role: "ACCOUNTANT",
  status: "ACTIVE",
};

const stamps = { createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01") };
const isoDate = (s: string) => new Date(`${s}T00:00:00.000Z`);
const FUTURE = isoDate("2099-12-31");
const PAST = isoDate("2000-01-01");

const draft: Homework = {
  id: "hw-1",
  schoolId: "s-1",
  academicYearId: "y-1",
  subjectId: "sub-1",
  sectionId: "sec-1",
  title: "Chapter 3 exercises",
  description: null,
  dueDate: FUTURE,
  status: "DRAFT",
  createdByStaffId: "sf-1",
  publishedByStaffId: null,
  publishedAt: null,
  closedByStaffId: null,
  closedAt: null,
  reopenedByStaffId: null,
  reopenedAt: null,
  reopenReason: null,
  ...stamps,
} as Homework;
const published: Homework = {
  ...draft,
  status: "PUBLISHED",
  publishedByStaffId: "sf-1",
  publishedAt: stamps.createdAt,
};
const closed: Homework = {
  ...published,
  status: "CLOSED",
  closedByStaffId: "sf-1",
  closedAt: stamps.createdAt,
};

const enrollment: Enrollment = {
  id: "en-1",
  schoolId: "s-1",
  studentId: "st-1",
  academicYearId: "y-1",
  sectionId: "sec-1",
  status: "ACTIVE",
  ...stamps,
} as Enrollment;

const submission: HomeworkSubmission = {
  id: "sub-1",
  schoolId: "s-1",
  homeworkId: "hw-1",
  enrollmentId: "en-1",
  submittedByParentId: "p-1",
  note: "done",
  status: "SUBMITTED",
  attempt: 1,
  isLate: false,
  firstSubmittedAt: stamps.createdAt,
  submittedAt: stamps.createdAt,
  reviewedByStaffId: null,
  reviewedAt: null,
  ...stamps,
} as HomeworkSubmission;

function makeRepos(over: Record<string, unknown> = {}) {
  const base = {
    audit: { record: vi.fn(async (): Promise<void> => undefined) },
    staff: {
      findByUserId: vi.fn(async () => ({ id: "sf-1", schoolId: "s-1", userId: "u-teacher" })),
    },
    parents: {
      findByUserId: vi.fn(async () => ({ id: "p-1", schoolId: "s-1", userId: "u-parent" })),
    },
    studentParents: { studentIdsForParent: vi.fn(async () => ["st-1"]) },
    students: { findById: vi.fn(async () => ({ id: "st-1", firstName: "Asha", lastName: "K" })) },
    academicYears: {
      findActive: vi.fn(async () => ({ id: "y-1", schoolId: "s-1", status: "ACTIVE" })),
    },
    subjects: { findById: vi.fn(async () => ({ id: "sub-1", schoolId: "s-1", name: "Math" })) },
    sections: { findById: vi.fn(async () => ({ id: "sec-1", classId: "c-1", name: "A" })) },
    teacherAssignments: {
      findByTriple: vi.fn(async (t: string, sub: string, sec: string) =>
        t === "u-teacher" && sub === "sub-1" && sec === "sec-1" ? { id: "ta-1" } : null,
      ),
      list: vi.fn(async () => [
        { id: "ta-1", subjectId: "sub-1", sectionId: "sec-1", teacherId: "u-teacher" },
      ]),
    },
    enrollments: {
      findById: vi.fn(async () => enrollment),
      listByStudent: vi.fn(async () => [enrollment]),
    },
    homework: {
      findById: vi.fn(async () => draft),
      create: vi.fn(async (input: Record<string, unknown>) => ({ ...draft, ...input })),
      updateContent: vi.fn(async (_id: string, d: Record<string, unknown>) => ({ ...draft, ...d })),
      extendDueDate: vi.fn(async (_id: string, dueDate: Date) => ({ ...published, dueDate })),
      transition: vi.fn(async (_id: string, _from: string, d: Record<string, unknown>) => ({
        ...draft,
        ...d,
      })),
      deleteDraft: vi.fn(async () => true),
      listByYear: vi.fn(async () => [published]),
      listBySection: vi.fn(async () => [draft]),
      listForParent: vi.fn(async () => [published]),
    },
    homeworkAttachments: {
      findById: vi.fn(async () => ({
        id: "at-1",
        schoolId: "s-1",
        homeworkId: "hw-1",
        storagePath: "p",
        fileName: "f.pdf",
      })),
      listByHomework: vi.fn(async () => []),
      countByHomework: vi.fn(async () => 0),
      create: vi.fn(async (i: Record<string, unknown>) => ({ id: "at-1", ...stamps, ...i })),
      delete: vi.fn(async () => undefined),
    },
    homeworkSubmissions: {
      findById: vi.fn(async () => submission),
      findByHomeworkEnrollment: vi.fn(async () => null),
      listByHomework: vi.fn(async () => [submission]),
      listByEnrollment: vi.fn(async () => [submission]),
      homeworkIdsForEnrollments: vi.fn(async () => []),
      create: vi.fn(async (i: Record<string, unknown>) => ({
        ...submission,
        ...i,
        id: "sub-new",
        attempt: 1,
      })),
      resubmit: vi.fn(async () => ({ ...submission, attempt: 2 })),
      review: vi.fn(async (_id: string, _a: number, d: Record<string, unknown>) => ({
        ...submission,
        ...d,
      })),
    },
    submissionAttachments: {
      findById: vi.fn(async () => ({
        id: "sat-1",
        schoolId: "s-1",
        submissionId: "sub-1",
        storagePath: "p",
        fileName: "f.pdf",
        attempt: 1,
      })),
      listBySubmission: vi.fn(async () => []),
      createMany: vi.fn(async () => 0),
    },
    homeworkFeedback: {
      listBySubmission: vi.fn(async () => []),
      create: vi.fn(async (i: Record<string, unknown>) => ({ id: "fb-1", ...stamps, ...i })),
    },
    ...over,
  };
  return base;
}

function makeCtx(user: Principal, repos = makeRepos()) {
  const repositories = repos as unknown as Repositories;
  const ctx: ServiceContext = {
    user,
    repositories,
    notifications: createNotificationService([]),
    withTransaction: <T>(fn: (r: Repositories) => Promise<T>) => fn(repositories),
  };
  return { ctx, repos };
}

function makeStorage(): StoragePort & {
  createSignedUploadUrl: ReturnType<typeof vi.fn>;
  createSignedDownloadUrl: ReturnType<typeof vi.fn>;
} {
  return {
    createSignedUploadUrl: vi.fn(async () => ({ signedUrl: "https://upload", token: "tok" })),
    createSignedDownloadUrl: vi.fn(async () => "https://download"),
    uploadObject: vi.fn(async () => undefined),
  };
}

const validCreate = { subjectId: "sub-1", sectionId: "sec-1", title: "HW", dueDate: FUTURE };

describe("homework.service — create + ownership + validity", () => {
  it("teacher creates a DRAFT for their own subject×section (audited)", async () => {
    const { ctx, repos } = makeCtx(teacher);
    const dto = await createHomework(ctx, validCreate);
    expect(dto.status).toBe("DRAFT");
    expect(repos.homework.create).toHaveBeenCalledTimes(1);
    expect(repos.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "HOMEWORK_CREATE" }),
    );
  });

  it("teacher cannot create for a subject×section they don't teach → Forbidden", async () => {
    const { ctx } = makeCtx(otherTeacher);
    await expect(createHomework(ctx, validCreate)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("accountant cannot create → Forbidden (no HOMEWORK_MANAGE)", async () => {
    const { ctx } = makeCtx(accountant);
    await expect(createHomework(ctx, validCreate)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("an unstaffed (subject×section) pair → ValidationError", async () => {
    const { ctx } = makeCtx(
      superAdmin,
      makeRepos({
        teacherAssignments: { findByTriple: vi.fn(async () => null), list: vi.fn(async () => []) },
      }),
    );
    await expect(createHomework(ctx, validCreate)).rejects.toBeInstanceOf(ValidationError);
  });

  it("no active academic year → ValidationError", async () => {
    const { ctx } = makeCtx(
      teacher,
      makeRepos({ academicYears: { findActive: vi.fn(async () => null) } }),
    );
    await expect(createHomework(ctx, validCreate)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("homework.service — lifecycle transitions (guarded + audited)", () => {
  it("publishes a DRAFT whose dueDate is today-or-later", async () => {
    const { ctx, repos } = makeCtx(teacher);
    const dto = await publishHomework(ctx, "hw-1");
    expect(dto.status).toBe("PUBLISHED");
    expect(repos.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "HOMEWORK_PUBLISH" }),
    );
  });

  it("refuses to publish an already-overdue homework → ValidationError", async () => {
    const { ctx } = makeCtx(
      teacher,
      makeRepos({
        homework: {
          ...makeRepos().homework,
          findById: vi.fn(async () => ({ ...draft, dueDate: PAST })),
        },
      }),
    );
    await expect(publishHomework(ctx, "hw-1")).rejects.toBeInstanceOf(ValidationError);
  });

  it("publishing a non-DRAFT → Conflict", async () => {
    const { ctx } = makeCtx(
      teacher,
      makeRepos({ homework: { ...makeRepos().homework, findById: vi.fn(async () => published) } }),
    );
    await expect(publishHomework(ctx, "hw-1")).rejects.toBeInstanceOf(ConflictError);
  });

  it("a lost publish race (transition→null) → Conflict, no audit", async () => {
    const repos = makeRepos({
      homework: { ...makeRepos().homework, transition: vi.fn(async () => null) },
    });
    const { ctx } = makeCtx(teacher, repos);
    await expect(publishHomework(ctx, "hw-1")).rejects.toBeInstanceOf(ConflictError);
    expect(repos.audit.record).not.toHaveBeenCalled();
  });

  it("closes a PUBLISHED homework", async () => {
    const { ctx } = makeCtx(
      teacher,
      makeRepos({
        homework: {
          ...makeRepos().homework,
          findById: vi.fn(async () => published),
          transition: vi.fn(async () => closed),
        },
      }),
    );
    const dto = await closeHomework(ctx, "hw-1");
    expect(dto.status).toBe("CLOSED");
  });

  it("closing a non-PUBLISHED homework → Conflict", async () => {
    const { ctx } = makeCtx(teacher);
    await expect(closeHomework(ctx, "hw-1")).rejects.toBeInstanceOf(ConflictError);
  });

  it("reopen requires a reason and only from CLOSED; clears the close stamp", async () => {
    const repos = makeRepos({
      homework: {
        ...makeRepos().homework,
        findById: vi.fn(async () => closed),
        transition: vi.fn(async (_i: string, _f: string, d: Record<string, unknown>) => ({
          ...published,
          ...d,
        })),
      },
    });
    const { ctx } = makeCtx(teacher, repos);
    await expect(reopenHomework(ctx, { homeworkId: "hw-1", reason: "  " })).rejects.toBeInstanceOf(
      ValidationError,
    );
    const dto = await reopenHomework(ctx, { homeworkId: "hw-1", reason: "closed too early" });
    expect(dto.status).toBe("PUBLISHED");
    expect(repos.homework.transition).toHaveBeenCalledWith(
      "hw-1",
      "CLOSED",
      expect.objectContaining({
        closedByStaffId: null,
        closedAt: null,
        reopenReason: "closed too early",
      }),
    );
  });

  it("reopening a non-CLOSED homework → Conflict", async () => {
    const { ctx } = makeCtx(teacher);
    await expect(reopenHomework(ctx, { homeworkId: "hw-1", reason: "x" })).rejects.toBeInstanceOf(
      ConflictError,
    );
  });
});

describe("homework.service — edit rules by state (§3)", () => {
  it("DRAFT: title/description/dueDate freely editable", async () => {
    const { ctx, repos } = makeCtx(teacher);
    await updateHomework(ctx, "hw-1", { title: "New" });
    expect(repos.homework.updateContent).toHaveBeenCalled();
  });

  it("PUBLISHED: content is frozen (title change) → Conflict", async () => {
    const { ctx } = makeCtx(
      teacher,
      makeRepos({ homework: { ...makeRepos().homework, findById: vi.fn(async () => published) } }),
    );
    await expect(updateHomework(ctx, "hw-1", { title: "x" })).rejects.toBeInstanceOf(ConflictError);
  });

  it("PUBLISHED: dueDate can be extended, never shortened", async () => {
    const repos = makeRepos({
      homework: {
        ...makeRepos().homework,
        findById: vi.fn(async () => ({ ...published, dueDate: isoDate("2099-06-01") })),
      },
    });
    const { ctx } = makeCtx(teacher, repos);
    await expect(
      updateHomework(ctx, "hw-1", { dueDate: isoDate("2099-01-01") }),
    ).rejects.toBeInstanceOf(ValidationError);
    await updateHomework(ctx, "hw-1", { dueDate: isoDate("2099-12-31") });
    expect(repos.homework.extendDueDate).toHaveBeenCalled();
  });

  it("CLOSED: no edits → Conflict", async () => {
    const { ctx } = makeCtx(
      teacher,
      makeRepos({ homework: { ...makeRepos().homework, findById: vi.fn(async () => closed) } }),
    );
    await expect(updateHomework(ctx, "hw-1", { dueDate: FUTURE })).rejects.toBeInstanceOf(
      ConflictError,
    );
  });
});

describe("homework.service — delete guard (R5 analog)", () => {
  it("deletes a DRAFT (audited)", async () => {
    const { ctx, repos } = makeCtx(teacher);
    await deleteHomework(ctx, "hw-1");
    expect(repos.homework.deleteDraft).toHaveBeenCalledWith("hw-1");
  });

  it("deleting a published homework → Conflict", async () => {
    const { ctx } = makeCtx(
      teacher,
      makeRepos({ homework: { ...makeRepos().homework, findById: vi.fn(async () => published) } }),
    );
    await expect(deleteHomework(ctx, "hw-1")).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("homework read scope — parent §10 or-clause (R3)", () => {
  it("parent sees a PUBLISHED homework via section-match (own child ACTIVE in section)", async () => {
    const { ctx } = makeCtx(
      parent,
      makeRepos({ homework: { ...makeRepos().homework, findById: vi.fn(async () => published) } }),
    );
    expect((await getHomework(ctx, "hw-1")).id).toBe("hw-1");
  });

  it("parent is denied a DRAFT (invisible until published) → Forbidden", async () => {
    const { ctx } = makeCtx(parent);
    await expect(getHomework(ctx, "hw-1")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("transferred child (no section-match) still sees CLOSED homework via has-submission", async () => {
    // child now in sec-2; the or-clause reaches hw-1 through an existing submission.
    const repos = makeRepos({
      homework: { ...makeRepos().homework, findById: vi.fn(async () => closed) },
      enrollments: {
        findById: vi.fn(async () => enrollment),
        listByStudent: vi.fn(async () => [{ ...enrollment, sectionId: "sec-2" }]),
      },
      homeworkSubmissions: {
        ...makeRepos().homeworkSubmissions,
        homeworkIdsForEnrollments: vi.fn(async () => ["hw-1"]),
      },
    });
    const { ctx } = makeCtx(parent, repos);
    expect((await getHomework(ctx, "hw-1")).id).toBe("hw-1");
  });

  it("parent with neither section-match nor submission → Forbidden", async () => {
    const repos = makeRepos({
      homework: { ...makeRepos().homework, findById: vi.fn(async () => published) },
      enrollments: {
        findById: vi.fn(async () => enrollment),
        listByStudent: vi.fn(async () => [{ ...enrollment, sectionId: "sec-2" }]),
      },
      homeworkSubmissions: {
        ...makeRepos().homeworkSubmissions,
        homeworkIdsForEnrollments: vi.fn(async () => []),
      },
    });
    const { ctx } = makeCtx(parent, repos);
    await expect(getHomework(ctx, "hw-1")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("listHomework for a parent uses the published-only or-clause query", async () => {
    const { ctx, repos } = makeCtx(parent);
    const rows = await listHomework(ctx, {});
    expect(rows).toHaveLength(1);
    expect(repos.homework.listForParent).toHaveBeenCalledWith(
      "s-1",
      ["sec-1"],
      [],
      ["PUBLISHED", "CLOSED"],
    );
  });
});

describe("submission.service — submit (§7 invariants + empty guard + isLate)", () => {
  const bundle = { homeworkId: "hw-1", enrollmentId: "en-1", note: "here", attachments: [] };

  it("parent submits for own child; audited, one row", async () => {
    const repos = makeRepos({
      homework: { ...makeRepos().homework, findById: vi.fn(async () => published) },
    });
    const { ctx } = makeCtx(parent, repos);
    const dto = await submitHomework(ctx, bundle);
    expect(dto.status).toBe("SUBMITTED");
    expect(repos.homeworkSubmissions.create).toHaveBeenCalledTimes(1);
  });

  it("empty submission (no note, no files) → ValidationError", async () => {
    const repos = makeRepos({
      homework: { ...makeRepos().homework, findById: vi.fn(async () => published) },
    });
    const { ctx } = makeCtx(parent, repos);
    await expect(submitHomework(ctx, { ...bundle, note: "  " })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("submitting into a non-PUBLISHED homework → Conflict", async () => {
    const { ctx } = makeCtx(parent); // default findById → DRAFT
    await expect(submitHomework(ctx, bundle)).rejects.toBeInstanceOf(ConflictError);
  });

  it("wrong-section enrollment → Forbidden", async () => {
    const repos = makeRepos({
      homework: { ...makeRepos().homework, findById: vi.fn(async () => published) },
      enrollments: {
        findById: vi.fn(async () => ({ ...enrollment, sectionId: "sec-2" })),
        listByStudent: vi.fn(async () => [enrollment]),
      },
    });
    const { ctx } = makeCtx(parent, repos);
    await expect(submitHomework(ctx, bundle)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("wrong-year enrollment → ValidationError", async () => {
    const repos = makeRepos({
      homework: { ...makeRepos().homework, findById: vi.fn(async () => published) },
      enrollments: {
        findById: vi.fn(async () => ({ ...enrollment, academicYearId: "y-OLD" })),
        listByStudent: vi.fn(async () => [enrollment]),
      },
    });
    const { ctx } = makeCtx(parent, repos);
    await expect(submitHomework(ctx, bundle)).rejects.toBeInstanceOf(ValidationError);
  });

  it("inactive enrollment → ValidationError", async () => {
    const repos = makeRepos({
      homework: { ...makeRepos().homework, findById: vi.fn(async () => published) },
      enrollments: {
        findById: vi.fn(async () => ({ ...enrollment, status: "DROPPED" })),
        listByStudent: vi.fn(async () => [enrollment]),
      },
    });
    const { ctx } = makeCtx(parent, repos);
    await expect(submitHomework(ctx, bundle)).rejects.toBeInstanceOf(ValidationError);
  });

  it("not-own-child enrollment → Forbidden", async () => {
    const repos = makeRepos({
      homework: { ...makeRepos().homework, findById: vi.fn(async () => published) },
      studentParents: { studentIdsForParent: vi.fn(async () => ["st-OTHER"]) },
    });
    const { ctx } = makeCtx(parent, repos);
    await expect(submitHomework(ctx, bundle)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("late submission snapshots isLate = true (now past dueDate)", async () => {
    const repos = makeRepos({
      homework: {
        ...makeRepos().homework,
        findById: vi.fn(async () => ({ ...published, dueDate: PAST })),
      },
    });
    const { ctx } = makeCtx(parent, repos);
    await submitHomework(ctx, bundle);
    expect(repos.homeworkSubmissions.create).toHaveBeenCalledWith(
      expect.objectContaining({ isLate: true }),
    );
  });

  it("a duplicate submit (row already exists) → Conflict", async () => {
    const repos = makeRepos({
      homework: { ...makeRepos().homework, findById: vi.fn(async () => published) },
      homeworkSubmissions: {
        ...makeRepos().homeworkSubmissions,
        findByHomeworkEnrollment: vi.fn(async () => submission),
      },
    });
    const { ctx } = makeCtx(parent, repos);
    await expect(submitHomework(ctx, bundle)).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("submission.service — resubmit (§6)", () => {
  const bundle = { homeworkId: "hw-1", enrollmentId: "en-1", note: "fixed", attachments: [] };

  it("resubmits a RETURNED submission in place (attempt++)", async () => {
    const repos = makeRepos({
      homework: { ...makeRepos().homework, findById: vi.fn(async () => published) },
      homeworkSubmissions: {
        ...makeRepos().homeworkSubmissions,
        findByHomeworkEnrollment: vi.fn(async () => ({ ...submission, status: "RETURNED" })),
      },
    });
    const { ctx } = makeCtx(parent, repos);
    const dto = await resubmitHomework(ctx, bundle);
    expect(dto.attempt).toBe(2);
    expect(repos.homeworkSubmissions.resubmit).toHaveBeenCalledWith("sub-1", 1, expect.anything());
  });

  it("resubmitting a REVIEWED submission → Conflict (terminal)", async () => {
    const repos = makeRepos({
      homework: { ...makeRepos().homework, findById: vi.fn(async () => published) },
      homeworkSubmissions: {
        ...makeRepos().homeworkSubmissions,
        findByHomeworkEnrollment: vi.fn(async () => ({ ...submission, status: "REVIEWED" })),
      },
    });
    const { ctx } = makeCtx(parent, repos);
    await expect(resubmitHomework(ctx, bundle)).rejects.toBeInstanceOf(ConflictError);
  });

  it("resubmit with no existing submission → NotFound", async () => {
    const repos = makeRepos({
      homework: { ...makeRepos().homework, findById: vi.fn(async () => published) },
    });
    const { ctx } = makeCtx(parent, repos);
    await expect(resubmitHomework(ctx, bundle)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("a lost resubmit race (resubmit→null) → Conflict", async () => {
    const repos = makeRepos({
      homework: { ...makeRepos().homework, findById: vi.fn(async () => published) },
      homeworkSubmissions: {
        ...makeRepos().homeworkSubmissions,
        findByHomeworkEnrollment: vi.fn(async () => ({ ...submission, status: "RETURNED" })),
        resubmit: vi.fn(async () => null),
      },
    });
    const { ctx } = makeCtx(parent, repos);
    await expect(resubmitHomework(ctx, bundle)).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("submission reads — scope", () => {
  it("listSubmissions is owner-gated: a non-owning teacher → Forbidden", async () => {
    const { ctx } = makeCtx(
      otherTeacher,
      makeRepos({ homework: { ...makeRepos().homework, findById: vi.fn(async () => published) } }),
    );
    await expect(listSubmissions(ctx, "hw-1")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("getSubmission: parent reads own child's submission", async () => {
    const { ctx } = makeCtx(parent);
    expect((await getSubmission(ctx, "sub-1")).id).toBe("sub-1");
  });

  it("getSubmission: parent denied another child's submission → Forbidden", async () => {
    const { ctx } = makeCtx(
      parent,
      makeRepos({ studentParents: { studentIdsForParent: vi.fn(async () => ["st-OTHER"]) } }),
    );
    await expect(getSubmission(ctx, "sub-1")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("submissionsForEnrollment: a teacher is excluded (own-subject×section only) → Forbidden", async () => {
    const { ctx } = makeCtx(teacher);
    await expect(submissionsForEnrollment(ctx, "en-1")).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("feedback.service — review (guarded, immutable rounds)", () => {
  it("teacher returns a submission with feedback (transitions + writes a round)", async () => {
    const repos = makeRepos({
      homework: { ...makeRepos().homework, findById: vi.fn(async () => published) },
    });
    const { ctx } = makeCtx(teacher, repos);
    const dto = await reviewSubmission(ctx, {
      submissionId: "sub-1",
      decision: "RETURNED",
      body: "redo Q2",
    });
    expect(dto.status).toBe("RETURNED");
    expect(repos.homeworkFeedback.create).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: 1, decision: "RETURNED" }),
    );
  });

  it("review requires a non-empty body → ValidationError", async () => {
    const { ctx } = makeCtx(
      teacher,
      makeRepos({ homework: { ...makeRepos().homework, findById: vi.fn(async () => published) } }),
    );
    await expect(
      reviewSubmission(ctx, { submissionId: "sub-1", decision: "REVIEWED", body: "  " }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("reviewing a non-SUBMITTED submission → Conflict", async () => {
    const repos = makeRepos({
      homeworkSubmissions: {
        ...makeRepos().homeworkSubmissions,
        findById: vi.fn(async () => ({ ...submission, status: "REVIEWED" })),
      },
    });
    const { ctx } = makeCtx(teacher, repos);
    await expect(
      reviewSubmission(ctx, { submissionId: "sub-1", decision: "RETURNED", body: "x" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("a lost review race (review→null) → Conflict, no feedback written", async () => {
    const repos = makeRepos({
      homework: { ...makeRepos().homework, findById: vi.fn(async () => published) },
      homeworkSubmissions: { ...makeRepos().homeworkSubmissions, review: vi.fn(async () => null) },
    });
    const { ctx } = makeCtx(teacher, repos);
    await expect(
      reviewSubmission(ctx, { submissionId: "sub-1", decision: "REVIEWED", body: "ok" }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(repos.homeworkFeedback.create).not.toHaveBeenCalled();
  });

  it("parent cannot review → Forbidden (no SUBMISSION_REVIEW)", async () => {
    const { ctx } = makeCtx(parent);
    await expect(
      reviewSubmission(ctx, { submissionId: "sub-1", decision: "REVIEWED", body: "x" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("listFeedback: parent reads own child's feedback", async () => {
    const { ctx } = makeCtx(parent);
    expect(await listFeedback(ctx, "sub-1")).toEqual([]);
  });
});

describe("storage mint authz — teacher + parent (mock StoragePort, M3 bar)", () => {
  it("teacher mints a DRAFT homework upload with a server-chosen path", async () => {
    const { ctx } = makeCtx(teacher);
    const storage = makeStorage();
    const minted = await mintHomeworkUploadUrl(ctx, storage, {
      homeworkId: "hw-1",
      fileName: "a b.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
    });
    expect(minted.storagePath).toMatch(/^s-1\/homework\/hw-1\//);
    expect(storage.createSignedUploadUrl).toHaveBeenCalledWith(
      "homework-files",
      minted.storagePath,
    );
  });

  it("teacher cannot mint on a PUBLISHED homework (content frozen) → Conflict, storage untouched", async () => {
    const { ctx } = makeCtx(
      teacher,
      makeRepos({ homework: { ...makeRepos().homework, findById: vi.fn(async () => published) } }),
    );
    const storage = makeStorage();
    await expect(
      mintHomeworkUploadUrl(ctx, storage, {
        homeworkId: "hw-1",
        fileName: "x.pdf",
        mimeType: "application/pdf",
        sizeBytes: 10,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(storage.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("a disallowed MIME type is rejected before minting → ValidationError, storage untouched", async () => {
    const { ctx } = makeCtx(teacher);
    const storage = makeStorage();
    await expect(
      mintHomeworkUploadUrl(ctx, storage, {
        homeworkId: "hw-1",
        fileName: "x.exe",
        mimeType: "application/x-msdownload",
        sizeBytes: 10,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(storage.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("addHomeworkAttachment persists metadata for a DRAFT (audited)", async () => {
    const { ctx, repos } = makeCtx(teacher);
    await addHomeworkAttachment(ctx, {
      homeworkId: "hw-1",
      storagePath: "s-1/homework/hw-1/u-a.pdf",
      fileName: "a.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2048,
    });
    expect(repos.homeworkAttachments.create).toHaveBeenCalledTimes(1);
    expect(repos.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "HOMEWORK_ATTACHMENT_ADD" }),
    );
  });

  it("parent mints a submission upload keyed by (homework, enrollment, attempt); server-chosen path", async () => {
    const { ctx } = makeCtx(
      parent,
      makeRepos({ homework: { ...makeRepos().homework, findById: vi.fn(async () => published) } }),
    );
    const storage = makeStorage();
    const minted = await mintSubmissionUploadUrl(ctx, storage, {
      homeworkId: "hw-1",
      enrollmentId: "en-1",
      attempt: 2,
      fileName: "work.pdf",
      mimeType: "application/pdf",
      sizeBytes: 50,
    });
    expect(minted.storagePath).toMatch(/^s-1\/submission\/hw-1\/en-1\/2\//);
    expect(storage.createSignedUploadUrl).toHaveBeenCalledWith(
      "homework-files",
      minted.storagePath,
    );
  });

  it("parent cannot mint for another child's enrollment → Forbidden, storage untouched", async () => {
    const { ctx } = makeCtx(
      parent,
      makeRepos({
        homework: { ...makeRepos().homework, findById: vi.fn(async () => published) },
        studentParents: { studentIdsForParent: vi.fn(async () => ["st-OTHER"]) },
      }),
    );
    const storage = makeStorage();
    await expect(
      mintSubmissionUploadUrl(ctx, storage, {
        homeworkId: "hw-1",
        enrollmentId: "en-1",
        attempt: 1,
        fileName: "x.pdf",
        mimeType: "application/pdf",
        sizeBytes: 10,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(storage.createSignedUploadUrl).not.toHaveBeenCalled();
  });
});

describe("storage DOWNLOAD authz — R4 / §10 (never to another parent)", () => {
  it("a linked parent downloads their own child's submission file (adapter called with bucket+path)", async () => {
    const { ctx } = makeCtx(parent);
    const storage = makeStorage();
    const { url } = await mintSubmissionAttachmentDownloadUrl(ctx, storage, "sat-1");
    expect(url).toBe("https://download");
    expect(storage.createSignedDownloadUrl).toHaveBeenCalledWith("homework-files", "p", 300);
  });

  it("another parent CANNOT download a submission file → Forbidden, storage untouched", async () => {
    // The submission's enrollment is child st-1; this parent's children are st-OTHER.
    const { ctx } = makeCtx(
      parent,
      makeRepos({ studentParents: { studentIdsForParent: vi.fn(async () => ["st-OTHER"]) } }),
    );
    const storage = makeStorage();
    await expect(mintSubmissionAttachmentDownloadUrl(ctx, storage, "sat-1")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(storage.createSignedDownloadUrl).not.toHaveBeenCalled();
  });

  it("teacher downloads a homework file for their own subject×section", async () => {
    const { ctx } = makeCtx(teacher);
    const storage = makeStorage();
    const { url } = await mintHomeworkAttachmentDownloadUrl(ctx, storage, "at-1");
    expect(url).toBe("https://download");
    expect(storage.createSignedDownloadUrl).toHaveBeenCalledWith("homework-files", "p", 300);
  });

  it("a parent CANNOT download a DRAFT homework's file → Forbidden, storage untouched", async () => {
    // Default homework is DRAFT → invisible to parents (§10).
    const { ctx } = makeCtx(parent);
    const storage = makeStorage();
    await expect(mintHomeworkAttachmentDownloadUrl(ctx, storage, "at-1")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(storage.createSignedDownloadUrl).not.toHaveBeenCalled();
  });
});

describe("R6 — missing actor rows fail as a clean domain error, not a 500", () => {
  it("a teacher with no Staff row cannot create homework → ValidationError", async () => {
    const { ctx } = makeCtx(
      teacher,
      makeRepos({ staff: { findByUserId: vi.fn(async () => null) } }),
    );
    await expect(createHomework(ctx, validCreate)).rejects.toBeInstanceOf(ValidationError);
  });

  it("a submitting user with no Parent row → ValidationError", async () => {
    const repos = makeRepos({
      homework: { ...makeRepos().homework, findById: vi.fn(async () => published) },
      parents: { findByUserId: vi.fn(async () => null) },
    });
    const { ctx } = makeCtx(parent, repos);
    await expect(
      submitHomework(ctx, { homeworkId: "hw-1", enrollmentId: "en-1", note: "x", attachments: [] }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
