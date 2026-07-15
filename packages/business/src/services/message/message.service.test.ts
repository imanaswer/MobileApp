import { ForbiddenError } from "@repo/core";
import type {
  ClassTeacherAssignment,
  Enrollment,
  Message,
  MessageThread,
  Notification,
  Parent,
  Repositories,
  Staff,
  Student,
  StudentParent,
  TeacherAssignment,
} from "@repo/db";
import { createNotificationService } from "@repo/notifications";
import { describe, expect, it, vi } from "vitest";

import type { Principal } from "../../authorization";
import type { ServiceContext } from "../../context";

import {
  createThread,
  listCounterparties,
  listThreads,
  markThreadRead,
  sendMessage,
  unreadMessageCount,
} from "./message.service";

/* ---- principals ---- */
const teacher: Principal = {
  userId: "u-teacher",
  schoolId: "s-1",
  role: "TEACHER",
  status: "ACTIVE",
};
const parent: Principal = { userId: "u-parent", schoolId: "s-1", role: "PARENT", status: "ACTIVE" };
const otherTeacher: Principal = { ...teacher, userId: "u-other-teacher" };

/* ---- fixtures ---- */
const d = new Date("2026-01-02T00:00:00.000Z");
const stamps = { createdAt: d, updatedAt: d };

const student: Student = {
  id: "st-1",
  schoolId: "s-1",
  admissionNo: "A1",
  firstName: "Kid",
  lastName: "One",
  dob: null,
  gender: null,
  bloodGroup: null,
  nationality: null,
  aadhaar: null,
  passport: null,
  address: null,
  photoPath: null,
  status: "ACTIVE",
  ...stamps,
};
const enrollment: Enrollment = {
  id: "e-1",
  schoolId: "s-1",
  studentId: "st-1",
  academicYearId: "y-1",
  classId: "c-1",
  sectionId: "sec-a",
  rollNo: 1,
  status: "ACTIVE",
  ...stamps,
};
const assignment: TeacherAssignment = {
  id: "ta-1",
  schoolId: "s-1",
  teacherId: "u-teacher",
  subjectId: "subj-1",
  sectionId: "sec-a",
  createdAt: d,
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
const staffRow = {
  id: "stf-1",
  userId: "u-teacher",
  name: "Teacher One",
} as Staff;
const thread = (over: Partial<MessageThread> = {}): MessageThread => ({
  id: "th-1",
  schoolId: "s-1",
  staffUserId: "u-teacher",
  guardianUserId: "u-parent",
  studentId: "st-1",
  lastMessageAt: d,
  ...stamps,
  ...over,
});
const message = (over: Partial<Message> = {}): Message => ({
  id: "m-1",
  threadId: "th-1",
  senderUserId: "u-teacher",
  body: "hello",
  readAt: null,
  createdAt: d,
  ...over,
});

function makeRepos(opts: { studentInScope?: boolean; current?: MessageThread } = {}) {
  const studentInScope = opts.studentInScope ?? true;
  return {
    audit: { record: vi.fn(async (): Promise<void> => undefined) },
    messages: {
      upsertThread: vi.fn(async (input: Record<string, unknown>): Promise<MessageThread> =>
        thread(input as Partial<MessageThread>),
      ),
      findThreadById: vi.fn(async (): Promise<MessageThread | null> => opts.current ?? thread()),
      listThreadsForUser: vi.fn(
        async (): Promise<
          (MessageThread & { unreadCount: number; lastMessageBody: string | null })[]
        > => [{ ...thread(), unreadCount: 2, lastMessageBody: "hello" }],
      ),
      createMessage: vi.fn(async (input: Record<string, unknown>): Promise<Message> =>
        message(input as Partial<Message>),
      ),
      listMessages: vi.fn(async (): Promise<Message[]> => [message()]),
      markThreadRead: vi.fn(async (): Promise<number> => 3),
      unreadCountForUser: vi.fn(async (): Promise<number> => 0),
    },
    students: { findById: vi.fn(async (): Promise<Student | null> => student) },
    enrollments: {
      findByStudentYear: vi.fn(async (): Promise<Enrollment | null> => enrollment),
      studentIdsInSections: vi.fn(async (): Promise<string[]> => (studentInScope ? ["st-1"] : [])),
    },
    teacherAssignments: { list: vi.fn(async (): Promise<TeacherAssignment[]> => [assignment]) },
    staff: { findByUserId: vi.fn(async (): Promise<Staff | null> => staffRow) },
    classTeacherAssignments: {
      findBySectionYear: vi.fn(async (): Promise<ClassTeacherAssignment | null> => null),
    },
    academicYears: {
      findActive: vi.fn(async () => ({ id: "y-1" }) as { id: string }),
    },
    parents: {
      findByUserId: vi.fn(async (): Promise<Parent | null> => parentRow),
      findById: vi.fn(async (): Promise<Parent | null> => parentRow),
    },
    studentParents: {
      listByStudent: vi.fn(async (): Promise<StudentParent[]> => [
        {
          studentId: "st-1",
          parentId: "par-1",
          relationship: "MOTHER",
          isPrimary: true,
          createdAt: d,
        },
      ]),
      studentIdsForParent: vi.fn(async (): Promise<string[]> => (studentInScope ? ["st-1"] : [])),
    },
    notifications: {
      create: vi.fn(async (): Promise<Notification> => ({ id: "n-1" }) as Notification),
    },
    notificationRecipients: {
      createMany: vi.fn(async (_id: string, userIds: string[]): Promise<number> => userIds.length),
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

describe("createThread — party resolution + scope", () => {
  it("teacher opens a thread with a guardian of an own-section student (self = staff)", async () => {
    const { ctx, repos } = makeCtx(teacher);
    await createThread(ctx, { studentId: "st-1", otherUserId: "u-parent" });
    expect(repos.messages.upsertThread).toHaveBeenCalledWith(
      expect.objectContaining({
        staffUserId: "u-teacher",
        guardianUserId: "u-parent",
        studentId: "st-1",
      }),
    );
  });

  it("teacher is refused a student outside their sections", async () => {
    const { ctx } = makeCtx(teacher, makeRepos({ studentInScope: false }));
    await expect(
      createThread(ctx, { studentId: "st-1", otherUserId: "u-parent" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("teacher is refused a counterparty who is not a guardian of the student", async () => {
    const { ctx } = makeCtx(teacher);
    await expect(
      createThread(ctx, { studentId: "st-1", otherUserId: "u-stranger" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("parent opens a thread with a teacher of their child's section (self = guardian)", async () => {
    const { ctx, repos } = makeCtx(parent);
    await createThread(ctx, { studentId: "st-1", otherUserId: "u-teacher" });
    expect(repos.messages.upsertThread).toHaveBeenCalledWith(
      expect.objectContaining({
        staffUserId: "u-teacher",
        guardianUserId: "u-parent",
        studentId: "st-1",
      }),
    );
  });

  it("parent is refused a counterparty who does not teach their child", async () => {
    const { ctx } = makeCtx(parent);
    await expect(
      createThread(ctx, { studentId: "st-1", otherUserId: "u-stranger" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("sendMessage — party gate + notification", () => {
  it("a non-party is refused (ForbiddenError)", async () => {
    const { ctx } = makeCtx(otherTeacher);
    await expect(sendMessage(ctx, { threadId: "th-1", body: "hi" })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("notifies the OTHER party (type MESSAGE) — teacher sends → parent notified", async () => {
    const { ctx, repos } = makeCtx(teacher);
    const result = await sendMessage(ctx, { threadId: "th-1", body: "hi" });
    expect(repos.messages.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: "th-1", senderUserId: "u-teacher", body: "hi" }),
    );
    expect(repos.notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: "MESSAGE" }),
    );
    expect(repos.notificationRecipients.createMany).toHaveBeenCalledWith("n-1", ["u-parent"]);
    expect(result.id).toBe("m-1");
  });

  it("parent sends → teacher (the other party) is notified", async () => {
    const { ctx, repos } = makeCtx(parent);
    await sendMessage(ctx, { threadId: "th-1", body: "hi back" });
    expect(repos.notificationRecipients.createMany).toHaveBeenCalledWith("n-1", ["u-teacher"]);
  });
});

describe("listCounterparties — scoped like createThread", () => {
  it("teacher sees the student's guardians (with a login) as PARENT counterparties", async () => {
    const { ctx } = makeCtx(teacher);
    const rows = await listCounterparties(ctx, { studentId: "st-1" });
    expect(rows).toEqual([{ userId: "u-parent", name: "Mom", role: "PARENT" }]);
  });

  it("parent sees the child's section teachers as TEACHER counterparties", async () => {
    const { ctx } = makeCtx(parent);
    const rows = await listCounterparties(ctx, { studentId: "st-1" });
    expect(rows).toEqual([{ userId: "u-teacher", name: "Teacher One", role: "TEACHER" }]);
  });

  it("an out-of-scope student is refused (ForbiddenError)", async () => {
    const { ctx } = makeCtx(teacher, makeRepos({ studentInScope: false }));
    await expect(listCounterparties(ctx, { studentId: "st-1" })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});

describe("markThreadRead / listThreads", () => {
  it("markThreadRead passes the reader id and returns the flipped count", async () => {
    const { ctx, repos } = makeCtx(parent);
    const res = await markThreadRead(ctx, { threadId: "th-1" });
    expect(repos.messages.markThreadRead).toHaveBeenCalledWith("th-1", "u-parent");
    expect(res.readCount).toBe(3);
  });

  it("listThreads returns a page with a null cursor when not full", async () => {
    const { ctx } = makeCtx(teacher);
    const page = await listThreads(ctx, {});
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBeNull();
  });

  it("listThreads carries the reader's unread count and a preview per thread", async () => {
    const { ctx } = makeCtx(teacher);
    const page = await listThreads(ctx, {});
    expect(page.items[0]?.unreadCount).toBe(2);
    expect(page.items[0]?.lastMessagePreview).toBe("hello");
  });

  it("unreadMessageCount counts across the caller's threads", async () => {
    const { ctx, repos } = makeCtx(parent);
    repos.messages.unreadCountForUser.mockResolvedValueOnce(5);
    const res = await unreadMessageCount(ctx);
    expect(repos.messages.unreadCountForUser).toHaveBeenCalledWith("u-parent");
    expect(res.count).toBe(5);
  });
});
