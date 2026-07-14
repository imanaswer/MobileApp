import {
  createServiceContext,
  createThread,
  listThreadMessages,
  listThreads,
  markThreadRead,
  sendMessage,
} from "@repo/business";
import {
  createThreadInput,
  listThreadsInput,
  markThreadReadInput,
  sendMessageInput,
  threadMessagesInput,
} from "@repo/validation";

import { protectedProcedure, router } from "../trpc";

/**
 * Teacher ↔ parent 1:1 messaging (M18). Thin transport only — validate (Zod) then
 * delegate; the business service enforces permission (message:send/read), the party
 * gate + student/counterparty scope, the lastMessageAt bump, and the best-effort M10
 * notification to the other party. No logic, no role strings, no Prisma.
 */
export const messageRouter = router({
  /** Open (or reuse — idempotent) a thread about a student with a counterparty. */
  createThread: protectedProcedure
    .input(createThreadInput)
    .mutation(({ ctx, input }) => createThread(createServiceContext(ctx.user), input)),
  /** Post a message to a thread the caller is a party of. */
  send: protectedProcedure
    .input(sendMessageInput)
    .mutation(({ ctx, input }) => sendMessage(createServiceContext(ctx.user), input)),
  /** The caller's threads (either party), newest-active first. Keyset paginated. */
  listThreads: protectedProcedure
    .input(listThreadsInput)
    .query(({ ctx, input }) => listThreads(createServiceContext(ctx.user), input)),
  /** Messages in a thread the caller is a party of, newest first. Keyset paginated. */
  threadMessages: protectedProcedure
    .input(threadMessagesInput)
    .query(({ ctx, input }) => listThreadMessages(createServiceContext(ctx.user), input)),
  /** Mark the other party's unread messages in a thread read. */
  markRead: protectedProcedure
    .input(markThreadReadInput)
    .mutation(({ ctx, input }) => markThreadRead(createServiceContext(ctx.user), input)),
});
