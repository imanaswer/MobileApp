import type { AnnouncementAttachment } from "@prisma/client";

import type { DbClient } from "../db-client";

export type { AnnouncementAttachment };

export interface CreateAnnouncementAttachmentInput {
  announcementId: string;
  path: string;
  fileName: string;
  sizeBytes: number;
  uploadedByStaffId: string;
}

/**
 * Persistence for `AnnouncementAttachment` (ADR-003, ADR-019 §1). No `schoolId`
 * column — tenant checks go via the parent Announcement in the business layer.
 * Restrict FK: a DRAFT announcement delete removes these rows first (deleteByAnnouncement),
 * inside the same service transaction.
 */
export interface AnnouncementAttachmentRepository {
  create(input: CreateAnnouncementAttachmentInput): Promise<AnnouncementAttachment>;
  findById(id: string): Promise<AnnouncementAttachment | null>;
  listByAnnouncement(announcementId: string): Promise<AnnouncementAttachment[]>;
  countByAnnouncement(announcementId: string): Promise<number>;
  delete(id: string): Promise<void>;
  deleteByAnnouncement(announcementId: string): Promise<void>;
}

export function createAnnouncementAttachmentRepository(
  client: DbClient,
): AnnouncementAttachmentRepository {
  return {
    create: (input) =>
      client.announcementAttachment.create({
        data: {
          announcementId: input.announcementId,
          path: input.path,
          fileName: input.fileName,
          sizeBytes: input.sizeBytes,
          uploadedByStaffId: input.uploadedByStaffId,
        },
      }),

    findById: (id) => client.announcementAttachment.findUnique({ where: { id } }),

    listByAnnouncement: (announcementId) =>
      client.announcementAttachment.findMany({
        where: { announcementId },
        orderBy: { createdAt: "asc" },
      }),

    countByAnnouncement: (announcementId) =>
      client.announcementAttachment.count({ where: { announcementId } }),

    delete: async (id) => {
      await client.announcementAttachment.delete({ where: { id } });
    },

    deleteByAnnouncement: async (announcementId) => {
      await client.announcementAttachment.deleteMany({ where: { announcementId } });
    },
  };
}
