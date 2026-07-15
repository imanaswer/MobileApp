import type { Message, MessageThread } from "@repo/db";
import type { IsoUtcString, MessageDto, MessageThreadDto } from "@repo/types";

const iso = (d: Date): IsoUtcString => d.toISOString() as IsoUtcString;
const isoOrNull = (d: Date | null): IsoUtcString | null => (d ? iso(d) : null);

export function mapThread(
  t: MessageThread,
  stats: { unreadCount: number; lastMessagePreview: string | null } = {
    unreadCount: 0,
    lastMessagePreview: null,
  },
): MessageThreadDto {
  return {
    id: t.id,
    schoolId: t.schoolId,
    staffUserId: t.staffUserId,
    guardianUserId: t.guardianUserId,
    studentId: t.studentId,
    lastMessageAt: iso(t.lastMessageAt),
    unreadCount: stats.unreadCount,
    lastMessagePreview: stats.lastMessagePreview,
    createdAt: iso(t.createdAt),
    updatedAt: iso(t.updatedAt),
  };
}

export function mapMessage(m: Message): MessageDto {
  return {
    id: m.id,
    threadId: m.threadId,
    senderUserId: m.senderUserId,
    body: m.body,
    readAt: isoOrNull(m.readAt),
    createdAt: iso(m.createdAt),
  };
}
