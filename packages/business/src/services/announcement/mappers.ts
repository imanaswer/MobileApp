import type { AnnouncementAttachment, AnnouncementWithAttachments } from "@repo/db";
import type { AnnouncementAttachmentDto, AnnouncementDto, IsoUtcString } from "@repo/types";

const iso = (d: Date): IsoUtcString => d.toISOString() as IsoUtcString;
const isoOrNull = (d: Date | null): IsoUtcString | null => (d ? iso(d) : null);

export function mapAnnouncementAttachment(a: AnnouncementAttachment): AnnouncementAttachmentDto {
  return {
    id: a.id,
    announcementId: a.announcementId,
    fileName: a.fileName,
    sizeBytes: a.sizeBytes,
    createdAt: iso(a.createdAt),
  };
}

export function mapAnnouncement(a: AnnouncementWithAttachments): AnnouncementDto {
  return {
    id: a.id,
    schoolId: a.schoolId,
    academicYearId: a.academicYearId,
    title: a.title,
    body: a.body,
    status: a.status,
    scope: a.scope,
    targetId: a.targetId,
    publishedAt: isoOrNull(a.publishedAt),
    createdByStaffId: a.createdByStaffId,
    createdAt: iso(a.createdAt),
    updatedAt: iso(a.updatedAt),
    attachments: a.attachments.map(mapAnnouncementAttachment),
  };
}
