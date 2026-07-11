import type { Announcement, AnnouncementScope, AnnouncementStatus, Prisma } from "@prisma/client";

import type { DbClient } from "../db-client";

export type { Announcement, AnnouncementScope, AnnouncementStatus };

const includeAttachments = {
  attachments: { orderBy: { createdAt: "asc" } },
} satisfies Prisma.AnnouncementInclude;

export type AnnouncementWithAttachments = Prisma.AnnouncementGetPayload<{
  include: typeof includeAttachments;
}>;

export interface CreateAnnouncementInput {
  schoolId: string;
  academicYearId: string;
  title: string;
  body: string;
  scope: AnnouncementScope;
  targetId?: string | null;
  createdByStaffId: string;
}

export interface UpdateAnnouncementInput {
  title?: string;
  body?: string;
  scope?: AnnouncementScope;
  targetId?: string | null;
}

/**
 * The viewer's targeting set (resolved in the business layer). A published
 * announcement is visible when its scope is one of `groups`, or it targets one of
 * the viewer's `sectionIds`/`classIds`. Groups always include WHOLE_SCHOOL for any
 * reader, so the OR is never empty (ADR-019 §5).
 */
export interface AnnouncementVisibility {
  groups: AnnouncementScope[];
  sectionIds: string[];
  classIds: string[];
}

export interface ListAnnouncementsFilter {
  status?: AnnouncementStatus;
  /** Restrict to this author's rows (teacher own-draft management). */
  createdByStaffId?: string;
  /** Business-resolved targeting; omit for admin (sees all). */
  visibleTo?: AnnouncementVisibility;
  limit: number;
  /** Keyset cursor — rows strictly older than this createdAt. */
  before?: Date;
}

/**
 * Persistence for `Announcement` (ADR-003, ADR-019). No authorization: the business
 * layer resolves permission, targeting (`visibleTo`), and lifecycle. Restrict FKs —
 * a DRAFT delete removes attachments first (see AnnouncementAttachmentRepository).
 */
export interface AnnouncementRepository {
  create(input: CreateAnnouncementInput): Promise<AnnouncementWithAttachments>;
  findById(id: string): Promise<AnnouncementWithAttachments | null>;
  list(schoolId: string, filter: ListAnnouncementsFilter): Promise<AnnouncementWithAttachments[]>;
  update(id: string, input: UpdateAnnouncementInput): Promise<AnnouncementWithAttachments>;
  /** DRAFT→PUBLISHED (stamps publishedAt now). Caller guarantees the row is a DRAFT. */
  publish(id: string): Promise<AnnouncementWithAttachments>;
  /** PUBLISHED→ARCHIVED (keeps publishedAt). Caller guarantees the row is PUBLISHED. */
  archive(id: string): Promise<AnnouncementWithAttachments>;
  delete(id: string): Promise<void>;
}

export function createAnnouncementRepository(client: DbClient): AnnouncementRepository {
  return {
    create: (input) =>
      client.announcement.create({
        data: {
          schoolId: input.schoolId,
          academicYearId: input.academicYearId,
          title: input.title,
          body: input.body,
          scope: input.scope,
          targetId: input.targetId ?? null,
          createdByStaffId: input.createdByStaffId,
        },
        include: includeAttachments,
      }),

    findById: (id) =>
      client.announcement.findUnique({ where: { id }, include: includeAttachments }),

    list: (schoolId, filter) => {
      const where: Prisma.AnnouncementWhereInput = { schoolId };
      if (filter.status) {
        where.status = filter.status;
      }
      if (filter.createdByStaffId) {
        where.createdByStaffId = filter.createdByStaffId;
      }
      if (filter.before) {
        where.createdAt = { lt: filter.before };
      }
      if (filter.visibleTo) {
        const v = filter.visibleTo;
        where.OR = [
          ...(v.groups.length ? [{ scope: { in: v.groups } }] : []),
          ...(v.sectionIds.length
            ? [{ scope: "SECTION" as AnnouncementScope, targetId: { in: v.sectionIds } }]
            : []),
          ...(v.classIds.length
            ? [{ scope: "CLASS" as AnnouncementScope, targetId: { in: v.classIds } }]
            : []),
        ];
      }
      return client.announcement.findMany({
        where,
        // ponytail: order by createdAt (≈ publishedAt for the publish-on-create flow).
        // Switch to publishedAt if scheduled/backdated publishing ever lands.
        orderBy: { createdAt: "desc" },
        take: filter.limit,
        include: includeAttachments,
      });
    },

    update: (id, input) =>
      client.announcement.update({
        where: { id },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.body !== undefined ? { body: input.body } : {}),
          ...(input.scope !== undefined ? { scope: input.scope } : {}),
          ...(input.targetId !== undefined ? { targetId: input.targetId } : {}),
        },
        include: includeAttachments,
      }),

    publish: (id) =>
      client.announcement.update({
        where: { id },
        data: { status: "PUBLISHED", publishedAt: new Date() },
        include: includeAttachments,
      }),

    archive: (id) =>
      client.announcement.update({
        where: { id },
        data: { status: "ARCHIVED" },
        include: includeAttachments,
      }),

    delete: async (id) => {
      await client.announcement.delete({ where: { id } });
    },
  };
}
