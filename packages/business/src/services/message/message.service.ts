import { PERMISSIONS } from "@repo/constants";
import { errorFields, ForbiddenError, logger } from "@repo/core";
import type { MessageDto, MessagePage, MessageThreadDto } from "@repo/types";

import { assertCan } from "../../authorization";
import type { ServiceContext } from "../../context";
import { createNotification } from "../notification/notification.service";
import { parentUserIdsForStudent } from "../notification/recipients";
import { activeYearId, assertStudentInScope, loadStudentInSchool } from "../people/scope";

import { mapMessage, mapThread } from "./mappers";
import { loadThreadAsParty } from "./scope";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const PREVIEW_MAX = 140;

function pageArgs(input: { limit?: number | undefined; before?: string | undefined }) {
  const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const before = input.before ? new Date(input.before) : undefined;
  return { limit, ...(before ? { before } : {}) };
}

/** Truncate a message body for the notification preview. */
function preview(body: string): string {
  return body.length > PREVIEW_MAX ? `${body.slice(0, PREVIEW_MAX)}…` : body;
}

/**
 * The teacher User ids the acting PARENT may open a thread with about `studentId`:
 * the subject teachers assigned to the student's ACTIVE-year section, plus that
 * section's class teacher. Empty when the student has no active-year enrollment.
 */
async function sectionTeacherUserIds(ctx: ServiceContext, studentId: string): Promise<string[]> {
  const yearId = await activeYearId(ctx);
  if (!yearId) {
    return [];
  }
  const enrollment = await ctx.repositories.enrollments.findByStudentYear(studentId, yearId);
  if (!enrollment?.sectionId) {
    return [];
  }
  const { sectionId } = enrollment;
  const assignments = await ctx.repositories.teacherAssignments.list(ctx.user.schoolId, {
    sectionId,
  });
  const ids = new Set(assignments.map((a) => a.teacherId));
  const classTeacher = await ctx.repositories.classTeacherAssignments.findBySectionYear(
    yearId,
    sectionId,
  );
  if (classTeacher) {
    ids.add(classTeacher.teacherId);
  }
  return [...ids];
}

export interface CreateThreadInput {
  studentId: string;
  /** The counterparty: the guardian (teacher path) or the teacher (parent path). */
  otherUserId: string;
}

/**
 * Open — or reuse (idempotent on the party unique) — a 1:1 thread about a student
 * (M18). A TEACHER may only address a guardian of an own-section student; a PARENT
 * may only address a teacher of their child's section. The acting user is always
 * the matching party (staff/guardian); the counterparty must pass the scope check.
 */
export async function createThread(
  ctx: ServiceContext,
  input: CreateThreadInput,
): Promise<MessageThreadDto> {
  assertCan(ctx.user, PERMISSIONS.MESSAGE_SEND);
  const student = await loadStudentInSchool(ctx, input.studentId);
  await assertStudentInScope(ctx, student); // teacher own-section / parent own-child

  let staffUserId: string;
  let guardianUserId: string;
  if (ctx.user.role === "TEACHER") {
    const guardianUserIds = await parentUserIdsForStudent(ctx.repositories, student.id);
    if (!guardianUserIds.includes(input.otherUserId)) {
      throw new ForbiddenError("Counterparty is not a guardian of this student");
    }
    staffUserId = ctx.user.userId;
    guardianUserId = input.otherUserId;
  } else if (ctx.user.role === "PARENT") {
    const teacherUserIds = await sectionTeacherUserIds(ctx, student.id);
    if (!teacherUserIds.includes(input.otherUserId)) {
      throw new ForbiddenError("Counterparty does not teach this student");
    }
    staffUserId = input.otherUserId;
    guardianUserId = ctx.user.userId;
  } else {
    throw new ForbiddenError("Messaging is between teachers and guardians only");
  }

  const thread = await ctx.repositories.messages.upsertThread({
    schoolId: ctx.user.schoolId,
    staffUserId,
    guardianUserId,
    studentId: student.id,
  });
  return mapThread(thread);
}

export interface SendMessageInput {
  threadId: string;
  body: string;
}

/**
 * Post a message to a thread the caller is a party of (M18). After the message +
 * lastMessageAt bump commit, best-effort notifies the OTHER party (M10 MESSAGE, the
 * canonical *AndNotify posture) — a delivery hiccup must not fail the committed send.
 */
export async function sendMessage(
  ctx: ServiceContext,
  input: SendMessageInput,
): Promise<MessageDto> {
  assertCan(ctx.user, PERMISSIONS.MESSAGE_SEND);
  const thread = await loadThreadAsParty(ctx, input.threadId);

  // createMessage does two writes (message + thread bump) — run in one transaction.
  const message = await ctx.withTransaction((repos) =>
    repos.messages.createMessage({
      threadId: thread.id,
      senderUserId: ctx.user.userId,
      body: input.body,
    }),
  );

  const otherUserId =
    thread.staffUserId === ctx.user.userId ? thread.guardianUserId : thread.staffUserId;
  try {
    await createNotification(ctx, {
      type: "MESSAGE",
      title: "New message",
      body: preview(input.body),
      actionUrl: `/messages/${thread.id}`,
      userId: otherUserId,
    });
  } catch (err) {
    logger.error("message notify failed", {
      route: "message.send",
      threadId: thread.id,
      ...errorFields(err),
    });
  }

  return mapMessage(message);
}

export interface ListThreadsInput {
  limit?: number | undefined;
  before?: string | undefined;
}

/** The acting user's threads (either party), newest-active first. Keyset paginated. */
export async function listThreads(
  ctx: ServiceContext,
  input: ListThreadsInput = {},
): Promise<MessagePage<MessageThreadDto>> {
  assertCan(ctx.user, PERMISSIONS.MESSAGE_READ);
  const page = pageArgs(input);
  const rows = await ctx.repositories.messages.listThreadsForUser(ctx.user.userId, page);
  const items = rows.map(mapThread);
  const last = items.at(-1);
  const nextCursor = last && items.length === page.limit ? last.lastMessageAt : null;
  return { items, nextCursor };
}

export interface ThreadMessagesInput {
  threadId: string;
  limit?: number | undefined;
  before?: string | undefined;
}

/** Messages in a thread the caller is a party of, newest first. Keyset paginated. */
export async function listThreadMessages(
  ctx: ServiceContext,
  input: ThreadMessagesInput,
): Promise<MessagePage<MessageDto>> {
  assertCan(ctx.user, PERMISSIONS.MESSAGE_READ);
  await loadThreadAsParty(ctx, input.threadId);
  const page = pageArgs(input);
  const rows = await ctx.repositories.messages.listMessages(input.threadId, page);
  const items = rows.map(mapMessage);
  const last = items.at(-1);
  const nextCursor = last && items.length === page.limit ? last.createdAt : null;
  return { items, nextCursor };
}

export interface MarkThreadReadInput {
  threadId: string;
}

/** Mark the OTHER party's unread messages in a thread read. Returns how many flipped. */
export async function markThreadRead(
  ctx: ServiceContext,
  input: MarkThreadReadInput,
): Promise<{ readCount: number }> {
  assertCan(ctx.user, PERMISSIONS.MESSAGE_READ);
  await loadThreadAsParty(ctx, input.threadId);
  const readCount = await ctx.repositories.messages.markThreadRead(input.threadId, ctx.user.userId);
  return { readCount };
}
