import {
  addAnnouncementAttachment,
  archiveAnnouncement,
  createAnnouncementDraft,
  createServiceContext,
  deleteAnnouncement,
  getAnnouncement,
  listAnnouncements,
  mintAnnouncementAttachmentDownloadUrl,
  mintAnnouncementUploadUrl,
  publishAnnouncement,
  removeAnnouncementAttachment,
  updateAnnouncement,
} from "@repo/business";
import {
  addAnnouncementAttachmentInput,
  attachmentIdInput,
  createAnnouncementDraftInput,
  idInput,
  listAnnouncementsInput,
  mintAnnouncementUploadUrlInput,
  publishAnnouncementInput,
  updateAnnouncementInput,
} from "@repo/validation";

import { protectedProcedure, router, storageProcedure } from "../trpc";

/**
 * Announcement procedures (M11, ADR-019). Thin transport only — validate (Zod) then
 * delegate; the business service enforces permission (announcement:read/manage/draft),
 * targeting/visibility, lifecycle, storage signing, in-tx audit, and the optional
 * post-commit M10 notification fan-out. No logic, no role strings, no Prisma. Storage
 * mints run the full authz chain in the service BEFORE any URL exists (ADR-004).
 */
export const announcementRouter = router({
  /** Feed / console list — role-aware (admin all-of-status; teacher DRAFT→own; else published+targeted). */
  list: protectedProcedure
    .input(listAnnouncementsInput)
    .query(({ ctx, input }) => listAnnouncements(createServiceContext(ctx.user), input)),
  /** One announcement, targeting-gated. */
  get: protectedProcedure
    .input(idInput)
    .query(({ ctx, input }) => getAnnouncement(createServiceContext(ctx.user), input.id)),

  /* ---- authoring (admin any scope; teacher own SECTION/CLASS draft) ---- */
  create: protectedProcedure
    .input(createAnnouncementDraftInput)
    .mutation(({ ctx, input }) => createAnnouncementDraft(createServiceContext(ctx.user), input)),
  update: protectedProcedure.input(updateAnnouncementInput).mutation(({ ctx, input }) => {
    const { id, ...rest } = input;
    return updateAnnouncement(createServiceContext(ctx.user), id, rest);
  }),
  /** DRAFT→PUBLISHED (admin only) — optionally fans out an M10 notification. */
  publish: protectedProcedure
    .input(publishAnnouncementInput)
    .mutation(({ ctx, input }) =>
      publishAnnouncement(
        createServiceContext(ctx.user),
        input.id,
        input.notify !== undefined ? { notify: input.notify } : {},
      ),
    ),
  /** PUBLISHED→ARCHIVED (admin only). */
  archive: protectedProcedure
    .input(idInput)
    .mutation(({ ctx, input }) => archiveAnnouncement(createServiceContext(ctx.user), input.id)),
  /** Hard-delete a DRAFT (author-owned). */
  delete: protectedProcedure
    .input(idInput)
    .mutation(({ ctx, input }) => deleteAnnouncement(createServiceContext(ctx.user), input.id)),

  /* ---- attachments (add/remove only while DRAFT) ---- */
  attachmentUploadUrl: storageProcedure
    .input(mintAnnouncementUploadUrlInput)
    .mutation(({ ctx, input }) =>
      mintAnnouncementUploadUrl(createServiceContext(ctx.user), ctx.storage, input),
    ),
  attachmentAdd: protectedProcedure
    .input(addAnnouncementAttachmentInput)
    .mutation(({ ctx, input }) => addAnnouncementAttachment(createServiceContext(ctx.user), input)),
  attachmentDownloadUrl: storageProcedure
    .input(attachmentIdInput)
    .mutation(({ ctx, input }) =>
      mintAnnouncementAttachmentDownloadUrl(
        createServiceContext(ctx.user),
        ctx.storage,
        input.attachmentId,
      ),
    ),
  attachmentRemove: protectedProcedure
    .input(attachmentIdInput)
    .mutation(({ ctx, input }) =>
      removeAnnouncementAttachment(createServiceContext(ctx.user), input.attachmentId),
    ),
});
