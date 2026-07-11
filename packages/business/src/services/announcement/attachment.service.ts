import { ANNOUNCEMENT_ATTACHMENT, PERMISSIONS, STORAGE_BUCKETS } from "@repo/constants";
import { ConflictError, NotFoundError, ValidationError } from "@repo/core";
import type { AnnouncementAttachmentDto } from "@repo/types";

import { assertCan } from "../../authorization";
import type { ServiceContext } from "../../context";
import type { MintedUploadUrl, StoragePort } from "../people/document-storage.service";

import { mapAnnouncementAttachment } from "./mappers";
import {
  assertAnnouncementAuthor,
  assertCanReadAnnouncement,
  assertOwnsDraft,
  loadAnnouncementInSchool,
  recordAudit,
  resolveActingStaffId,
} from "./scope";

/** Signed read URLs stay valid this long — the M3/M6 constant. */
const DOWNLOAD_URL_TTL_SECONDS = 300;

const safeFileName = (name: string): string => name.replace(/[^\w.-]+/g, "_").slice(-100);

/** Validate the client's CLAIMED mime/size against the M11 limits (ADR-019 §8). */
export function assertAnnouncementFileAllowed(mimeType: string, sizeBytes: number): void {
  if (!ANNOUNCEMENT_ATTACHMENT.ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw new ValidationError(`File type not allowed: ${mimeType}`);
  }
  if (sizeBytes <= 0 || sizeBytes > ANNOUNCEMENT_ATTACHMENT.MAX_FILE_BYTES) {
    throw new ValidationError("File exceeds the maximum allowed size");
  }
}

/** Author-gated + DRAFT-only + count guard, shared by mint + add. Returns the loaded announcement. */
async function assertCanAttach(ctx: ServiceContext, announcementId: string) {
  const announcement = await loadAnnouncementInSchool(ctx, announcementId);
  await assertOwnsDraft(ctx, announcement);
  await assertAnnouncementAuthor(ctx, announcement.scope, announcement.targetId);
  if (announcement.status !== "DRAFT") {
    throw new ConflictError("Attachments can only be changed while the announcement is a draft");
  }
  const existing =
    await ctx.repositories.announcementAttachments.countByAnnouncement(announcementId);
  if (existing >= ANNOUNCEMENT_ATTACHMENT.MAX_FILES) {
    throw new ValidationError(
      `An announcement may have at most ${ANNOUNCEMENT_ATTACHMENT.MAX_FILES} files`,
    );
  }
  return announcement;
}

export interface MintAnnouncementUploadInput {
  announcementId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

/** Mint a one-time signed UPLOAD URL — full write-authz first; path is server-chosen. */
export async function mintAnnouncementUploadUrl(
  ctx: ServiceContext,
  storage: StoragePort,
  input: MintAnnouncementUploadInput,
): Promise<MintedUploadUrl> {
  assertCan(ctx.user, PERMISSIONS.ANNOUNCEMENT_READ);
  await assertCanAttach(ctx, input.announcementId);
  assertAnnouncementFileAllowed(input.mimeType, input.sizeBytes);

  const storagePath = `${ctx.user.schoolId}/announcements/${input.announcementId}/${crypto.randomUUID()}-${safeFileName(input.fileName)}`;
  const { signedUrl, token } = await storage.createSignedUploadUrl(
    STORAGE_BUCKETS.ANNOUNCEMENT_ATTACHMENTS,
    storagePath,
  );
  return { storagePath, signedUrl, token };
}

export interface AddAnnouncementAttachmentInput {
  announcementId: string;
  path: string;
  fileName: string;
  sizeBytes: number;
}

/** Persist attachment metadata after upload (DRAFT-only, count-guarded, author-owned). Audited. */
export async function addAnnouncementAttachment(
  ctx: ServiceContext,
  input: AddAnnouncementAttachmentInput,
): Promise<AnnouncementAttachmentDto> {
  assertCan(ctx.user, PERMISSIONS.ANNOUNCEMENT_READ);
  await assertCanAttach(ctx, input.announcementId);
  const staffId = await resolveActingStaffId(ctx);

  return ctx.withTransaction(async (repos) => {
    const created = await repos.announcementAttachments.create({
      announcementId: input.announcementId,
      path: input.path,
      fileName: input.fileName,
      sizeBytes: input.sizeBytes,
      uploadedByStaffId: staffId,
    });
    await recordAudit(ctx, repos, {
      action: "ANNOUNCEMENT_ATTACHMENT_ADD",
      entityType: "AnnouncementAttachment",
      entityId: created.id,
      after: { announcementId: input.announcementId, fileName: created.fileName },
    });
    return mapAnnouncementAttachment(created);
  });
}

/**
 * Mint a short-lived signed READ URL — runs the FULL announcement read-authz chain
 * (targeting) BEFORE any URL exists, so an out-of-scope reader can't pull a file by id
 * (ADR-019 §6/§8; the R4 leak guard).
 */
export async function mintAnnouncementAttachmentDownloadUrl(
  ctx: ServiceContext,
  storage: StoragePort,
  attachmentId: string,
): Promise<{ url: string; fileName: string }> {
  assertCan(ctx.user, PERMISSIONS.ANNOUNCEMENT_READ);
  const attachment = await ctx.repositories.announcementAttachments.findById(attachmentId);
  if (!attachment) {
    throw new NotFoundError("Attachment not found");
  }
  const announcement = await loadAnnouncementInSchool(ctx, attachment.announcementId);
  await assertCanReadAnnouncement(ctx, announcement);

  const url = await storage.createSignedDownloadUrl(
    STORAGE_BUCKETS.ANNOUNCEMENT_ATTACHMENTS,
    attachment.path,
    DOWNLOAD_URL_TTL_SECONDS,
  );
  return { url, fileName: attachment.fileName };
}

/** Remove an attachment (DRAFT-only, author-owned). Metadata only — bytes left (M3 posture). Audited. */
export async function removeAnnouncementAttachment(
  ctx: ServiceContext,
  attachmentId: string,
): Promise<void> {
  assertCan(ctx.user, PERMISSIONS.ANNOUNCEMENT_READ);
  const attachment = await ctx.repositories.announcementAttachments.findById(attachmentId);
  if (!attachment) {
    throw new NotFoundError("Attachment not found");
  }
  const announcement = await loadAnnouncementInSchool(ctx, attachment.announcementId);
  await assertOwnsDraft(ctx, announcement);
  if (announcement.status !== "DRAFT") {
    throw new ConflictError("Attachments can only be removed while the announcement is a draft");
  }

  await ctx.withTransaction(async (repos) => {
    await repos.announcementAttachments.delete(attachmentId);
    await recordAudit(ctx, repos, {
      action: "ANNOUNCEMENT_ATTACHMENT_REMOVE",
      entityType: "AnnouncementAttachment",
      entityId: attachmentId,
      before: { announcementId: attachment.announcementId, fileName: attachment.fileName },
    });
  });
}
