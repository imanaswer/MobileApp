import { ForbiddenError, NotFoundError, ValidationError } from "@repo/core";
import type {
  Assessment,
  Enrollment,
  ExamSection,
  Notification,
  NotificationRecipient,
  Parent,
  Repositories,
  StudentParent,
  TeacherAssignment,
  User,
} from "@repo/db";
import { createNotificationService } from "@repo/notifications";
import { describe, expect, it, vi } from "vitest";

import type { Principal } from "../../authorization";
import type { ServiceContext } from "../../context";

import { createAnnouncement } from "./announcement.service";
import {
  archiveNotification,
  createBulkNotification,
  deleteNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  unarchiveNotification,
  unreadNotificationCount,
} from "./notification.service";
import { parentUserIdsForSection, teacherUserIdsForExam } from "./recipients";

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

/* ---- fixtures ---- */
const d = new Date("2026-01-02T00:00:00.000Z");
const stamps = { createdAt: d, updatedAt: d };

const notif: Notification = {
  id: "n-1",
  schoolId: "s-1",
  type: "HOMEWORK_PUBLISHED",
  priority: "NORMAL",
  title: "New homework",
  body: "Algebra worksheet",
  actionUrl: "/homework/h-1",
  createdAt: d,
};
const recipientRow: NotificationRecipient & { notification: Notification } = {
  id: "r-1",
  notificationId: "n-1",
  userId: "u-parent",
  isRead: false,
  readAt: null,
  isArchived: false,
  archivedAt: null,
  createdAt: d,
  notification: notif,
};
const parentRow: Parent = {
  id: "par-1",
  schoolId: "s-1",
  userId: "u-parent",
  name: "Mom",
  phone: "9",
  email: null,
  occupation: null,
  address: null,
  preferredContact: "PHONE",
  ...stamps,
};
const enrollment = (studentId: string): Enrollment => ({
  id: `e-${studentId}`,
  schoolId: "s-1",
  studentId,
  academicYearId: "y-1",
  classId: "cls-5",
  sectionId: "sec-5a",
  rollNo: 1,
  status: "ACTIVE",
  ...stamps,
});
const assignmentRow: TeacherAssignment = {
  id: "ta-1",
  schoolId: "s-1",
  teacherId: "u-teacher",
  subjectId: "subj-math",
  sectionId: "sec-5a",
  createdAt: d,
};
const userRow = (id: string): User => ({
  id,
  schoolId: "s-1",
  role: "PARENT",
  status: "ACTIVE",
  phone: null,
  email: null,
  locale: "EN",
  lastLoginAt: null,
  ...stamps,
});

function makeRepos() {
  return {
    audit: { record: vi.fn(async (): Promise<void> => undefined) },
    notifications: { create: vi.fn(async (): Promise<Notification> => notif) },
    notificationRecipients: {
      createMany: vi.fn(async (_id: string, userIds: string[]): Promise<number> => userIds.length),
      listForUser: vi.fn(
        async (): Promise<(NotificationRecipient & { notification: Notification })[]> => [
          recipientRow,
        ],
      ),
      markRead: vi.fn(async (): Promise<number> => 1),
      markAllRead: vi.fn(async (): Promise<number> => 3),
      setArchived: vi.fn(async (): Promise<number> => 1),
      deleteForUser: vi.fn(async (): Promise<number> => 1),
      unreadCount: vi.fn(async (): Promise<number> => 5),
    },
    users: {
      listBySchool: vi.fn(async (): Promise<User[]> => [userRow("u-t1"), userRow("u-p1")]),
    },
    enrollments: {
      listBySection: vi.fn(async (): Promise<Enrollment[]> => [
        enrollment("st-1"),
        enrollment("st-2"),
      ]),
      findById: vi.fn(async (): Promise<Enrollment | null> => enrollment("st-1")),
    },
    studentParents: {
      listByStudent: vi.fn(async (studentId: string): Promise<StudentParent[]> => [
        {
          studentId,
          parentId: studentId === "st-1" ? "par-1" : "par-2",
          relationship: "MOTHER",
          isPrimary: false,
          createdAt: d,
        },
      ]),
    },
    parents: {
      findById: vi.fn(async (id: string): Promise<Parent | null> =>
        id === "par-1" ? parentRow : { ...parentRow, id: "par-2", userId: null },
      ),
    },
    teacherAssignments: {
      list: vi.fn(async (): Promise<TeacherAssignment[]> => [assignmentRow]),
    },
    assessments: {
      listByExam: vi.fn(async (): Promise<Assessment[]> => [{ id: "a-1" } as Assessment]),
    },
    examSections: {
      listByAssessmentIds: vi.fn(async (): Promise<ExamSection[]> => [
        { sectionId: "sec-5a" } as ExamSection,
        { sectionId: "sec-5a" } as ExamSection,
      ]),
    },
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

describe("createBulkNotification", () => {
  it("writes one Notification + N recipients + one audit row", async () => {
    const { ctx, repos } = makeCtx(admin);
    const res = await createBulkNotification(ctx, {
      type: "ANNOUNCEMENT",
      title: "Hi",
      body: "b",
      userIds: ["u-1", "u-2"],
    });
    expect(repos.notifications.create).toHaveBeenCalledTimes(1);
    expect(repos.notificationRecipients.createMany).toHaveBeenCalledWith("n-1", ["u-1", "u-2"]);
    expect(repos.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "NOTIFICATION_CREATE", entityId: "n-1" }),
    );
    expect(res).toEqual({ notificationId: "n-1", recipientCount: 2 });
  });

  it("de-dups userIds before persisting", async () => {
    const { ctx, repos } = makeCtx(admin);
    await createBulkNotification(ctx, {
      type: "SYSTEM",
      title: "t",
      body: "b",
      userIds: ["u-1", "u-1", "u-2"],
    });
    expect(repos.notificationRecipients.createMany).toHaveBeenCalledWith("n-1", ["u-1", "u-2"]);
  });

  it("is a no-op when there are no recipients (nothing to notify)", async () => {
    const { ctx, repos } = makeCtx(admin);
    const res = await createBulkNotification(ctx, {
      type: "SYSTEM",
      title: "t",
      body: "b",
      userIds: [],
    });
    expect(repos.notifications.create).not.toHaveBeenCalled();
    expect(res).toEqual({ notificationId: null, recipientCount: 0 });
  });
});

describe("inbox read state", () => {
  it("markRead flips the caller's own row and audits", async () => {
    const { ctx, repos } = makeCtx(parent);
    await markNotificationRead(ctx, "r-1");
    expect(repos.notificationRecipients.markRead).toHaveBeenCalledWith("r-1", "u-parent");
    expect(repos.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "NOTIFICATION_READ", entityId: "r-1" }),
    );
  });

  it("markRead 404s an id that isn't the caller's", async () => {
    const repos = makeRepos();
    repos.notificationRecipients.markRead.mockResolvedValueOnce(0);
    const { ctx } = makeCtx(parent, repos);
    await expect(markNotificationRead(ctx, "r-x")).rejects.toThrow(NotFoundError);
  });

  it("markAllRead returns how many flipped", async () => {
    const { ctx, repos } = makeCtx(parent);
    await expect(markAllNotificationsRead(ctx)).resolves.toBe(3);
    expect(repos.notificationRecipients.markAllRead).toHaveBeenCalledWith("u-parent");
  });

  it("unreadCount reads the badge count for the caller", async () => {
    const { ctx, repos } = makeCtx(parent);
    await expect(unreadNotificationCount(ctx)).resolves.toBe(5);
    expect(repos.notificationRecipients.unreadCount).toHaveBeenCalledWith("u-parent");
  });
});

describe("archive / delete", () => {
  it("archive sets archived + audits NOTIFICATION_ARCHIVE", async () => {
    const { ctx, repos } = makeCtx(parent);
    await archiveNotification(ctx, "r-1");
    expect(repos.notificationRecipients.setArchived).toHaveBeenCalledWith("r-1", "u-parent", true);
    expect(repos.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "NOTIFICATION_ARCHIVE" }),
    );
  });

  it("unarchive clears archived + audits NOTIFICATION_UNARCHIVE", async () => {
    const { ctx, repos } = makeCtx(parent);
    await unarchiveNotification(ctx, "r-1");
    expect(repos.notificationRecipients.setArchived).toHaveBeenCalledWith("r-1", "u-parent", false);
    expect(repos.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "NOTIFICATION_UNARCHIVE" }),
    );
  });

  it("delete removes the caller's own copy and audits", async () => {
    const { ctx, repos } = makeCtx(parent);
    await deleteNotification(ctx, "r-1");
    expect(repos.notificationRecipients.deleteForUser).toHaveBeenCalledWith("r-1", "u-parent");
    expect(repos.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "NOTIFICATION_DELETE" }),
    );
  });

  it("delete 404s a non-owned id", async () => {
    const repos = makeRepos();
    repos.notificationRecipients.deleteForUser.mockResolvedValueOnce(0);
    const { ctx } = makeCtx(parent, repos);
    await expect(deleteNotification(ctx, "r-x")).rejects.toThrow(NotFoundError);
  });
});

describe("listNotifications", () => {
  it("maps recipient rows to the per-user DTO", async () => {
    const { ctx } = makeCtx(parent);
    const [dto] = await listNotifications(ctx, {});
    expect(dto).toMatchObject({
      id: "r-1",
      notificationId: "n-1",
      type: "HOMEWORK_PUBLISHED",
      title: "New homework",
      isRead: false,
      actionUrl: "/homework/h-1",
    });
  });
});

describe("recipient resolution", () => {
  it("parentUserIdsForSection de-dups and skips parents without a login user", async () => {
    const repos = makeRepos() as unknown as Repositories;
    const ids = await parentUserIdsForSection(repos, "y-1", "sec-5a");
    // st-1 → par-1 (u-parent); st-2 → par-2 (userId null, skipped)
    expect(ids).toEqual(["u-parent"]);
  });

  it("teacherUserIdsForExam de-dups the exam's section teachers", async () => {
    const repos = makeRepos() as unknown as Repositories;
    const ids = await teacherUserIdsForExam(repos, "s-1", "exam-1");
    expect(ids).toEqual(["u-teacher"]);
  });
});

describe("createAnnouncement", () => {
  it("denies a parent (no announcement:send)", async () => {
    const { ctx, repos } = makeCtx(parent);
    await expect(
      createAnnouncement(ctx, { scope: "SCHOOL", title: "t", body: "b" }),
    ).rejects.toThrow(ForbiddenError);
    expect(repos.notifications.create).not.toHaveBeenCalled();
  });

  it("denies a teacher (no announcement:send)", async () => {
    const { ctx } = makeCtx(teacher);
    await expect(
      createAnnouncement(ctx, { scope: "SCHOOL", title: "t", body: "b" }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("SCHOOL scope fans out to active parents + teachers", async () => {
    const { ctx, repos } = makeCtx(admin);
    await createAnnouncement(ctx, { scope: "SCHOOL", title: "Holiday", body: "Closed Friday" });
    expect(repos.users.listBySchool).toHaveBeenCalledWith("s-1", {
      roles: ["TEACHER", "PARENT"],
      status: "ACTIVE",
    });
    expect(repos.notificationRecipients.createMany).toHaveBeenCalledWith("n-1", ["u-t1", "u-p1"]);
  });

  it("SECTION scope requires a sectionId", async () => {
    const { ctx } = makeCtx(admin);
    await expect(
      createAnnouncement(ctx, { scope: "SECTION", title: "t", body: "b" }),
    ).rejects.toThrow(ValidationError);
  });

  it("SECTION scope notifies the section's parents + assigned teachers", async () => {
    const { ctx, repos } = makeCtx(admin);
    await createAnnouncement(ctx, {
      scope: "SECTION",
      sectionId: "sec-5a",
      academicYearId: "y-1",
      title: "PTM",
      body: "Saturday",
    });
    const [, userIds] = repos.notificationRecipients.createMany.mock.calls[0]!;
    expect(userIds).toEqual(expect.arrayContaining(["u-parent", "u-teacher"]));
  });
});
