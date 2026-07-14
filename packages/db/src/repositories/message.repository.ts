import type { Message, MessageThread } from "@prisma/client";

import type { DbClient } from "../db-client";

export type { Message, MessageThread };

export interface UpsertThreadInput {
  schoolId: string;
  staffUserId: string;
  guardianUserId: string;
  studentId: string;
}

export interface CreateMessageInput {
  threadId: string;
  senderUserId: string;
  body: string;
}

/** Keyset page — rows strictly older than `before`, newest first, capped at `limit`. */
export interface KeysetPage {
  limit: number;
  before?: Date;
}

/**
 * Persistence for M18 teacher↔parent messaging (`MessageThread` + `Message`). No
 * authorization: the business layer resolves permission and the party gate. A thread
 * is idempotent on its (staff, guardian, student) party unique — `upsertThread` is a
 * no-op create-or-return. `createMessage` also bumps the thread's `lastMessageAt`, so
 * it MUST run inside a transaction (called via `withTransaction`) for the two writes
 * to commit atomically.
 */
export interface MessageRepository {
  upsertThread(input: UpsertThreadInput): Promise<MessageThread>;
  findThreadById(id: string): Promise<MessageThread | null>;
  listThreadsForUser(userId: string, page: KeysetPage): Promise<MessageThread[]>;
  createMessage(input: CreateMessageInput): Promise<Message>;
  listMessages(threadId: string, page: KeysetPage): Promise<Message[]>;
  /** Mark the OTHER party's unread messages read; returns how many flipped. */
  markThreadRead(threadId: string, readerUserId: string): Promise<number>;
  /** Count of unread messages across all threads the user is a party of. */
  unreadCountForUser(userId: string): Promise<number>;
}

export function createMessageRepository(client: DbClient): MessageRepository {
  return {
    upsertThread: (input) =>
      client.messageThread.upsert({
        where: {
          staffUserId_guardianUserId_studentId: {
            staffUserId: input.staffUserId,
            guardianUserId: input.guardianUserId,
            studentId: input.studentId,
          },
        },
        create: input,
        update: {},
      }),

    findThreadById: (id) => client.messageThread.findUnique({ where: { id } }),

    listThreadsForUser: (userId, page) =>
      client.messageThread.findMany({
        where: {
          OR: [{ staffUserId: userId }, { guardianUserId: userId }],
          ...(page.before ? { lastMessageAt: { lt: page.before } } : {}),
        },
        orderBy: { lastMessageAt: "desc" },
        take: page.limit,
      }),

    // Two writes — atomic ONLY when `client` is a transaction client (withTransaction).
    createMessage: async (input) => {
      const message = await client.message.create({ data: input });
      await client.messageThread.update({
        where: { id: input.threadId },
        data: { lastMessageAt: message.createdAt },
      });
      return message;
    },

    listMessages: (threadId, page) =>
      client.message.findMany({
        where: {
          threadId,
          ...(page.before ? { createdAt: { lt: page.before } } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: page.limit,
      }),

    markThreadRead: async (threadId, readerUserId) => {
      const res = await client.message.updateMany({
        where: { threadId, senderUserId: { not: readerUserId }, readAt: null },
        data: { readAt: new Date() },
      });
      return res.count;
    },

    unreadCountForUser: (userId) =>
      client.message.count({
        where: {
          senderUserId: { not: userId },
          readAt: null,
          thread: { OR: [{ staffUserId: userId }, { guardianUserId: userId }] },
        },
      }),
  } satisfies MessageRepository;
}
