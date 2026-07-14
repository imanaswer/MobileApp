import { ForbiddenError, NotFoundError } from "@repo/core";
import type { MessageThread } from "@repo/db";

import type { ServiceContext } from "../../context";

/** Is the acting user one of the thread's two parties? */
export function isThreadParty(ctx: ServiceContext, thread: MessageThread): boolean {
  return thread.staffUserId === ctx.user.userId || thread.guardianUserId === ctx.user.userId;
}

/**
 * Load a thread and assert the caller is a party of it (M18). 404 for a missing or
 * other-tenant thread; 403 for a real thread the caller is not a party of.
 */
export async function loadThreadAsParty(
  ctx: ServiceContext,
  threadId: string,
): Promise<MessageThread> {
  const thread = await ctx.repositories.messages.findThreadById(threadId);
  if (!thread || thread.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Thread not found");
  }
  if (!isThreadParty(ctx, thread)) {
    throw new ForbiddenError("Not a party of this thread");
  }
  return thread;
}
