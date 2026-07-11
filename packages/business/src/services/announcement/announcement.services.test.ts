import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@repo/core";
import type {
  AnnouncementAttachment,
  AnnouncementWithAttachments,
  Class,
  Enrollment,
  Parent,
  Repositories,
  Section,
  Staff,
  TeacherAssignment,
  User,
} from "@repo/db";
import { createNotificationService } from "@repo/notifications";
import { describe, expect, it, vi } from "vitest";

import type { Principal } from "../../authorization";
import type { ServiceContext } from "../../context";
import type { StoragePort } from "../people/document-storage.service";

import {
  archiveAnnouncement,
  createAnnouncementDraft,
  deleteAnnouncement,
  getAnnouncement,
  listAnnouncements,
  publishAnnouncement,
  updateAnnouncement,
} from "./announcement.service";
import {
  addAnnouncementAttachment,
  mintAnnouncementAttachmentDownloadUrl,
  removeAnnouncementAttachment,
} from "./attachment.service";

/* ---- principals ---- */
const admin: Principal = {
  userId: "u-admin",
  schoolId: "s-1",
  role: "OFFICE_ADMIN",
  status: "ACTIVE",
};
const teacher: Principal = {
  userId: "u-teacher",
  schoolId: "s-1",
  role: "TEACHER",
  status: "ACTIVE",
};
const parent: Principal = { userId: "u-parent", schoolId: "s-1", role: "PARENT", status: "ACTIVE" };

const d = new Date("2026-01-02T00:00:00.000Z");
const STAFF_ADMIN = "stf-admin";
const STAFF_TEACHER = "stf-teacher";

function ann(overrides: Partial<AnnouncementWithAttachments>): AnnouncementWithAttachments {
  return {
    id: "a-1",
    schoolId: "s-1",
    academicYearId: "y-1",
    title: "T",
    body: "B",
    status: "DRAFT",
    scope: "WHOLE_SCHOOL",
    targetId: null,
    publishedAt: null,
    createdByStaffId: STAFF_ADMIN,
    createdAt: d,
    updatedAt: d,
    attachments: [],
    ...overrides,
  };
}

const FIX: Record<string, AnnouncementWithAttachments> = {
  "a-draft-school": ann({ id: "a-draft-school", status: "DRAFT", scope: "WHOLE_SCHOOL" }),
  "a-draft-teacher": ann({
    id: "a-draft-teacher",
    status: "DRAFT",
    scope: "SECTION",
    targetId: "sec-5a",
    createdByStaffId: STAFF_TEACHER,
  }),
  "a-pub-5a": ann({
    id: "a-pub-5a",
    status: "PUBLISHED",
    scope: "SECTION",
    targetId: "sec-5a",
    publishedAt: d,
    attachments: [
      {
        id: "att-1",
        announcementId: "a-pub-5a",
        path: "p",
        fileName: "f.pdf",
        sizeBytes: 10,
        uploadedByStaffId: STAFF_ADMIN,
        createdAt: d,
      },
    ],
  }),
  "a-pub-other": ann({
    id: "a-pub-other",
    status: "PUBLISHED",
    scope: "SECTION",
    targetId: "sec-OTHER",
    publishedAt: d,
  }),
  "a-pub-school": ann({
    id: "a-pub-school",
    status: "PUBLISHED",
    scope: "WHOLE_SCHOOL",
    publishedAt: d,
  }),
  "a-pub-class": ann({
    id: "a-pub-class",
    status: "PUBLISHED",
    scope: "CLASS",
    targetId: "cls-5",
    publishedAt: d,
  }),
  "a-pub-class-other": ann({
    id: "a-pub-class-other",
    status: "PUBLISHED",
    scope: "CLASS",
    targetId: "cls-OTHER",
    publishedAt: d,
  }),
};

const attRow: AnnouncementAttachment = FIX["a-pub-5a"]!.attachments[0]!;

const staffRow = (id: string): Staff => ({ id }) as Staff;
const section = (id: string): Section =>
  ({ id, classId: "cls-5", name: "A" }) as unknown as Section;
const enrollment: Enrollment = { sectionId: "sec-5a", classId: "cls-5" } as Enrollment;
const parentRow: Parent = { id: "par-1", userId: "u-parent" } as Parent;

function makeRepos() {
  return {
    audit: { record: vi.fn(async (): Promise<void> => undefined) },
    announcements: {
      findById: vi.fn(async (id: string) => FIX[id] ?? null),
      create: vi.fn(async (input: { scope: string; targetId: string | null }) =>
        ann({
          id: "a-new",
          status: "DRAFT",
          scope: input.scope as never,
          targetId: input.targetId,
        }),
      ),
      update: vi.fn(async (id: string) => ann({ id })),
      publish: vi.fn(async (id: string) =>
        ann({ ...FIX[id], id, status: "PUBLISHED", publishedAt: d }),
      ),
      archive: vi.fn(async (id: string) =>
        ann({ ...FIX[id], id, status: "ARCHIVED", publishedAt: d }),
      ),
      delete: vi.fn(async (): Promise<void> => undefined),
      list: vi.fn(async () => [FIX["a-pub-school"]!]),
    },
    announcementAttachments: {
      findById: vi.fn(async (id: string) => (id === "att-1" ? attRow : null)),
      create: vi.fn(async () => attRow),
      countByAnnouncement: vi.fn(async (): Promise<number> => 0),
      delete: vi.fn(async (): Promise<void> => undefined),
      deleteByAnnouncement: vi.fn(async (): Promise<void> => undefined),
    },
    staff: {
      findByUserId: vi.fn(async (userId: string) =>
        userId === "u-teacher"
          ? staffRow(STAFF_TEACHER)
          : userId === "u-admin"
            ? staffRow(STAFF_ADMIN)
            : null,
      ),
    },
    sections: {
      findById: vi.fn(async (id: string) => section(id)),
      listByClass: vi.fn(async () => [section("sec-5a")]),
    },
    classes: { findById: vi.fn(async (id: string) => ({ id, schoolId: "s-1" }) as Class) },
    teacherAssignments: {
      list: vi.fn(async (): Promise<TeacherAssignment[]> => [
        {
          id: "ta",
          schoolId: "s-1",
          teacherId: "u-teacher",
          subjectId: "subj",
          sectionId: "sec-5a",
          createdAt: d,
        },
      ]),
    },
    enrollments: {
      findByStudentYear: vi.fn(async (): Promise<Enrollment | null> => enrollment),
      listBySection: vi.fn(async (): Promise<Enrollment[]> => [enrollment]),
    },
    parents: {
      findByUserId: vi.fn(async (): Promise<Parent | null> => parentRow),
      findById: vi.fn(async (): Promise<Parent | null> => parentRow),
    },
    studentParents: {
      studentIdsForParent: vi.fn(async (): Promise<string[]> => ["st-1"]),
      listByStudent: vi.fn(async (studentId: string) => [
        { studentId, parentId: "par-1", relationship: "MOTHER", isPrimary: true, createdAt: d },
      ]),
    },
    academicYears: { findActive: vi.fn(async () => ({ id: "y-1" })) },
    users: {
      listBySchool: vi.fn(async (): Promise<User[]> => [
        { id: "u-p1" } as User,
        { id: "u-t1" } as User,
      ]),
    },
    notifications: { create: vi.fn(async () => ({ id: "n-1" })) },
    notificationRecipients: { createMany: vi.fn(async (_id: string, ids: string[]) => ids.length) },
  };
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

const storage: StoragePort = {
  createSignedUploadUrl: vi.fn(async () => ({ signedUrl: "up", token: "tok" })),
  createSignedDownloadUrl: vi.fn(async () => "https://signed/download"),
} as unknown as StoragePort;

/* ============================ lifecycle & authoring ============================ */

describe("createAnnouncementDraft", () => {
  it("admin creates a WHOLE_SCHOOL draft + audits", async () => {
    const { ctx, repos } = makeCtx(admin);
    const res = await createAnnouncementDraft(ctx, {
      title: "Hi",
      body: "b",
      scope: "WHOLE_SCHOOL",
    });
    expect(res.status).toBe("DRAFT");
    expect(repos.announcements.create).toHaveBeenCalledTimes(1);
    expect(repos.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ANNOUNCEMENT_CREATE" }),
    );
  });

  it("teacher creates a SECTION draft for their own section", async () => {
    const { ctx, repos } = makeCtx(teacher);
    await createAnnouncementDraft(ctx, {
      title: "Hi",
      body: "b",
      scope: "SECTION",
      targetId: "sec-5a",
    });
    expect(repos.announcements.create).toHaveBeenCalled();
  });

  it("teacher CANNOT author a WHOLE_SCHOOL announcement (Forbidden)", async () => {
    const { ctx } = makeCtx(teacher);
    await expect(
      createAnnouncementDraft(ctx, { title: "Hi", body: "b", scope: "WHOLE_SCHOOL" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("teacher CANNOT target a section they do not teach (Forbidden)", async () => {
    const { ctx } = makeCtx(teacher);
    await expect(
      createAnnouncementDraft(ctx, {
        title: "Hi",
        body: "b",
        scope: "SECTION",
        targetId: "sec-OTHER",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("parent CANNOT author (Forbidden)", async () => {
    const { ctx } = makeCtx(parent);
    await expect(
      createAnnouncementDraft(ctx, { title: "Hi", body: "b", scope: "WHOLE_SCHOOL" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects a SECTION scope with no target (ValidationError)", async () => {
    const { ctx } = makeCtx(admin);
    await expect(
      createAnnouncementDraft(ctx, { title: "Hi", body: "b", scope: "SECTION" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("publishAnnouncement", () => {
  it("admin publishes a DRAFT and fans out a notification (default notify)", async () => {
    const { ctx, repos } = makeCtx(admin, { ...makeRepos() });
    repos.announcements.findById = vi.fn(async () => FIX["a-draft-school"]!);
    const res = await publishAnnouncement(ctx, "a-draft-school");
    expect(res.status).toBe("PUBLISHED");
    expect(repos.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ANNOUNCEMENT_PUBLISH" }),
    );
    expect(repos.notifications.create).toHaveBeenCalledTimes(1); // emit happened
  });

  it("notify:false publishes but emits NOTHING", async () => {
    const { ctx, repos } = makeCtx(admin);
    repos.announcements.findById = vi.fn(async () => FIX["a-draft-school"]!);
    await publishAnnouncement(ctx, "a-draft-school", { notify: false });
    expect(repos.notifications.create).not.toHaveBeenCalled();
  });

  it("teacher CANNOT publish (Forbidden — admin-only)", async () => {
    const { ctx } = makeCtx(teacher);
    await expect(publishAnnouncement(ctx, "a-draft-teacher")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("cannot publish an already-published announcement (Conflict)", async () => {
    const { ctx } = makeCtx(admin);
    await expect(publishAnnouncement(ctx, "a-pub-school")).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("archive / update / delete", () => {
  it("archives a PUBLISHED announcement (admin)", async () => {
    const { ctx, repos } = makeCtx(admin);
    const res = await archiveAnnouncement(ctx, "a-pub-school");
    expect(res.status).toBe("ARCHIVED");
    expect(repos.announcements.archive).toHaveBeenCalled();
  });

  it("cannot archive a DRAFT (Conflict)", async () => {
    const { ctx } = makeCtx(admin);
    await expect(archiveAnnouncement(ctx, "a-draft-school")).rejects.toBeInstanceOf(ConflictError);
  });

  it("cannot edit a PUBLISHED announcement — published content is immutable (Conflict)", async () => {
    const { ctx } = makeCtx(admin);
    await expect(updateAnnouncement(ctx, "a-pub-school", { title: "x" })).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("deletes a DRAFT: removes attachments then the row + audit", async () => {
    const { ctx, repos } = makeCtx(admin);
    await deleteAnnouncement(ctx, "a-draft-school");
    expect(repos.announcementAttachments.deleteByAnnouncement).toHaveBeenCalledWith(
      "a-draft-school",
    );
    expect(repos.announcements.delete).toHaveBeenCalledWith("a-draft-school");
  });

  it("cannot delete a PUBLISHED announcement (Conflict — archive instead)", async () => {
    const { ctx } = makeCtx(admin);
    await expect(deleteAnnouncement(ctx, "a-pub-school")).rejects.toBeInstanceOf(ConflictError);
  });
});

/* ============================ visibility / targeting ============================ */

describe("getAnnouncement — targeting (business gate; RLS is coarse)", () => {
  it("admin reads any announcement", async () => {
    const { ctx } = makeCtx(admin);
    expect((await getAnnouncement(ctx, "a-draft-school")).id).toBe("a-draft-school");
  });

  it("parent reads a PUBLISHED announcement targeting their child's section", async () => {
    const { ctx } = makeCtx(parent);
    expect((await getAnnouncement(ctx, "a-pub-5a")).id).toBe("a-pub-5a");
  });

  it("parent is 404'd on a PUBLISHED announcement for ANOTHER section (leak guard)", async () => {
    const { ctx } = makeCtx(parent);
    await expect(getAnnouncement(ctx, "a-pub-other")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("parent reads a PUBLISHED CLASS announcement for their child's class", async () => {
    const { ctx } = makeCtx(parent);
    expect((await getAnnouncement(ctx, "a-pub-class")).id).toBe("a-pub-class");
  });

  it("parent is 404'd on a CLASS announcement for another class (leak guard)", async () => {
    const { ctx } = makeCtx(parent);
    await expect(getAnnouncement(ctx, "a-pub-class-other")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("parent is 404'd on a DRAFT", async () => {
    const { ctx } = makeCtx(parent);
    await expect(getAnnouncement(ctx, "a-draft-school")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("listAnnouncements", () => {
  it("teacher DRAFT tab queries ONLY their own drafts", async () => {
    const { ctx, repos } = makeCtx(teacher);
    await listAnnouncements(ctx, { status: "DRAFT" });
    expect(repos.announcements.list).toHaveBeenCalledWith(
      "s-1",
      expect.objectContaining({ status: "DRAFT", createdByStaffId: STAFF_TEACHER }),
    );
  });

  it("parent feed queries PUBLISHED with a WHOLE_SCHOOL/PARENTS visibility set", async () => {
    const { ctx, repos } = makeCtx(parent);
    await listAnnouncements(ctx, {});
    expect(repos.announcements.list).toHaveBeenCalledWith(
      "s-1",
      expect.objectContaining({
        status: "PUBLISHED",
        visibleTo: expect.objectContaining({ groups: ["WHOLE_SCHOOL", "PARENTS"] }),
      }),
    );
  });
});

/* ============================ attachments & storage ============================ */

describe("attachments", () => {
  it("adds an attachment to a DRAFT (author) + audits", async () => {
    const { ctx, repos } = makeCtx(admin);
    await addAnnouncementAttachment(ctx, {
      announcementId: "a-draft-school",
      path: "p",
      fileName: "f.pdf",
      sizeBytes: 10,
    });
    expect(repos.announcementAttachments.create).toHaveBeenCalled();
    expect(repos.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ANNOUNCEMENT_ATTACHMENT_ADD" }),
    );
  });

  it("cannot add an attachment to a PUBLISHED announcement (Conflict)", async () => {
    const { ctx } = makeCtx(admin);
    await expect(
      addAnnouncementAttachment(ctx, {
        announcementId: "a-pub-5a",
        path: "p",
        fileName: "f",
        sizeBytes: 1,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("download mints a signed URL for a reader who can see the announcement", async () => {
    const { ctx } = makeCtx(parent);
    const res = await mintAnnouncementAttachmentDownloadUrl(ctx, storage, "att-1");
    expect(res.url).toBe("https://signed/download");
  });

  it("download is 404'd for a parent out of the announcement's scope (R4 leak guard)", async () => {
    const repos = makeRepos();
    // point the attachment at the other-section announcement
    repos.announcementAttachments.findById = vi.fn(async () => ({
      ...attRow,
      announcementId: "a-pub-other",
    }));
    const { ctx } = makeCtx(parent, repos);
    await expect(
      mintAnnouncementAttachmentDownloadUrl(ctx, storage, "att-1"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("removes an attachment from a DRAFT + audits", async () => {
    const repos = makeRepos();
    repos.announcementAttachments.findById = vi.fn(async () => ({
      ...attRow,
      announcementId: "a-draft-school",
    }));
    const { ctx } = makeCtx(admin, repos);
    await removeAnnouncementAttachment(ctx, "att-1");
    expect(repos.announcementAttachments.delete).toHaveBeenCalledWith("att-1");
  });
});
