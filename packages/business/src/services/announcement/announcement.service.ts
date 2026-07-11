import { PERMISSIONS } from "@repo/constants";
import { can, ConflictError } from "@repo/core";
import type { AnnouncementStatus } from "@repo/db";
import type { AnnouncementDto } from "@repo/types";

import { assertCan } from "../../authorization";
import type { ServiceContext } from "../../context";
import { createBulkNotification } from "../notification/notification.service";
import { activeYearId } from "../people/scope";

import { mapAnnouncement } from "./mappers";
import { resolveAnnouncementRecipients } from "./recipients";
import {
  assertAnnouncementAuthor,
  assertCanReadAnnouncement,
  assertOwnsDraft,
  assertScopeTarget,
  isFullAccess,
  loadAnnouncementInSchool,
  readerVisibility,
  recordAudit,
  resolveActingStaffId,
} from "./scope";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

type ScopeKey = AnnouncementDto["scope"];

export interface CreateAnnouncementDraftInput {
  title: string;
  body: string;
  scope: ScopeKey;
  targetId?: string | null | undefined;
  /** Recipient/year context — defaults to the school's ACTIVE year. */
  academicYearId?: string | undefined;
}

export interface UpdateAnnouncementInput {
  title?: string | undefined;
  body?: string | undefined;
  scope?: ScopeKey | undefined;
  targetId?: string | null | undefined;
}

/**
 * Announcement lifecycle (M11, ADR-019). DRAFT→PUBLISHED→ARCHIVED. Authors are
 * admins (any scope) + teachers (own SECTION/CLASS drafts); publish/archive are
 * admin-only. Published content is immutable. Every mutation writes AuditLog in the
 * same transaction; publish optionally fans out an M10 notification after commit.
 */

/** Create a DRAFT (author-gated + scope-target validated). Audited. */
export async function createAnnouncementDraft(
  ctx: ServiceContext,
  input: CreateAnnouncementDraftInput,
): Promise<AnnouncementDto> {
  await assertAnnouncementAuthor(ctx, input.scope, input.targetId);
  await assertScopeTarget(ctx, input.scope, input.targetId);
  const staffId = await resolveActingStaffId(ctx);
  const yearId = input.academicYearId ?? (await activeYearId(ctx));
  if (!yearId) {
    throw new ConflictError("No active academic year to attach the announcement to");
  }

  return ctx.withTransaction(async (repos) => {
    const created = await repos.announcements.create({
      schoolId: ctx.user.schoolId,
      academicYearId: yearId,
      title: input.title,
      body: input.body,
      scope: input.scope,
      targetId: input.targetId ?? null,
      createdByStaffId: staffId,
    });
    await recordAudit(ctx, repos, {
      action: "ANNOUNCEMENT_CREATE",
      entityType: "Announcement",
      entityId: created.id,
      after: { scope: input.scope, targetId: input.targetId ?? null, status: created.status },
    });
    return mapAnnouncement(created);
  });
}

/** Edit a DRAFT (author-owned; published content is immutable). Audited. */
export async function updateAnnouncement(
  ctx: ServiceContext,
  id: string,
  input: UpdateAnnouncementInput,
): Promise<AnnouncementDto> {
  const existing = await loadAnnouncementInSchool(ctx, id);
  if (existing.status !== "DRAFT") {
    throw new ConflictError("Only a draft announcement can be edited");
  }
  await assertOwnsDraft(ctx, existing);
  const nextScope = input.scope ?? existing.scope;
  const nextTarget = input.targetId !== undefined ? input.targetId : existing.targetId;
  if (input.scope !== undefined || input.targetId !== undefined) {
    await assertAnnouncementAuthor(ctx, nextScope, nextTarget);
    await assertScopeTarget(ctx, nextScope, nextTarget);
  }

  return ctx.withTransaction(async (repos) => {
    const updated = await repos.announcements.update(id, {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.body !== undefined ? { body: input.body } : {}),
      ...(input.scope !== undefined ? { scope: input.scope } : {}),
      ...(input.targetId !== undefined ? { targetId: input.targetId } : {}),
    });
    await recordAudit(ctx, repos, {
      action: "ANNOUNCEMENT_UPDATE",
      entityType: "Announcement",
      entityId: id,
      after: { scope: updated.scope, targetId: updated.targetId },
    });
    return mapAnnouncement(updated);
  });
}

/**
 * Publish a DRAFT (admin-only). Flips status + stamps publishedAt + audits in-tx;
 * then, best-effort AFTER commit, optionally fans out an M10 ANNOUNCEMENT notification
 * to the resolved recipients (ADR-019 §3 — the canonical *AndNotify pattern).
 */
export async function publishAnnouncement(
  ctx: ServiceContext,
  id: string,
  options: { notify?: boolean } = {},
): Promise<AnnouncementDto> {
  assertCan(ctx.user, PERMISSIONS.ANNOUNCEMENT_MANAGE);
  const existing = await loadAnnouncementInSchool(ctx, id);
  if (existing.status !== "DRAFT") {
    throw new ConflictError("Only a draft announcement can be published");
  }

  const published = await ctx.withTransaction(async (repos) => {
    const row = await repos.announcements.publish(id);
    await recordAudit(ctx, repos, {
      action: "ANNOUNCEMENT_PUBLISH",
      entityType: "Announcement",
      entityId: id,
      after: {
        scope: row.scope,
        targetId: row.targetId,
        publishedAt: row.publishedAt?.toISOString() ?? null,
      },
    });
    return row;
  });

  if (options.notify !== false) {
    // Best-effort (ADR-018 §3 posture): a notification hiccup must not fail a committed publish.
    try {
      const userIds = await resolveAnnouncementRecipients(ctx, published);
      await createBulkNotification(ctx, {
        type: "ANNOUNCEMENT",
        priority: "NORMAL",
        title: published.title,
        body: published.body,
        actionUrl: `/announcements/${published.id}`,
        userIds,
      });
    } catch (err) {
      console.error(`[announcement] notify failed for ${published.id}`, err);
    }
  }

  return mapAnnouncement(published);
}

/** Archive a PUBLISHED announcement (admin-only) — the soft delete. Audited. */
export async function archiveAnnouncement(
  ctx: ServiceContext,
  id: string,
): Promise<AnnouncementDto> {
  assertCan(ctx.user, PERMISSIONS.ANNOUNCEMENT_MANAGE);
  const existing = await loadAnnouncementInSchool(ctx, id);
  if (existing.status !== "PUBLISHED") {
    throw new ConflictError("Only a published announcement can be archived");
  }
  return ctx.withTransaction(async (repos) => {
    const row = await repos.announcements.archive(id);
    await recordAudit(ctx, repos, {
      action: "ANNOUNCEMENT_ARCHIVE",
      entityType: "Announcement",
      entityId: id,
    });
    return mapAnnouncement(row);
  });
}

/**
 * Hard-delete a DRAFT only (author-owned) — a draft has no audience/history
 * (ADR-019 §4). Removes its attachments then the row in one tx (all FKs Restrict).
 * Storage bytes are left (M3 posture). Audited.
 */
export async function deleteAnnouncement(ctx: ServiceContext, id: string): Promise<void> {
  const existing = await loadAnnouncementInSchool(ctx, id);
  await assertOwnsDraft(ctx, existing);
  if (existing.status !== "DRAFT") {
    throw new ConflictError("Only a draft announcement can be deleted (archive a published one)");
  }
  await ctx.withTransaction(async (repos) => {
    await repos.announcementAttachments.deleteByAnnouncement(id);
    await repos.announcements.delete(id);
    await recordAudit(ctx, repos, {
      action: "ANNOUNCEMENT_DELETE",
      entityType: "Announcement",
      entityId: id,
      before: { scope: existing.scope, targetId: existing.targetId },
    });
  });
}

/** Read one announcement, gated by targeting (ADR-019 §6). */
export async function getAnnouncement(ctx: ServiceContext, id: string): Promise<AnnouncementDto> {
  assertCan(ctx.user, PERMISSIONS.ANNOUNCEMENT_READ);
  const a = await loadAnnouncementInSchool(ctx, id);
  await assertCanReadAnnouncement(ctx, a);
  return mapAnnouncement(a);
}

export interface ListAnnouncementsInput {
  /** Admin: any status tab. Teacher: DRAFT → own drafts; else the published feed. */
  status?: AnnouncementStatus | undefined;
  limit?: number | undefined;
  before?: string | undefined;
}

/**
 * List announcements (ADR-019 §5). Admin → all of `status`. Teacher asking for
 * DRAFT → their own drafts. Everyone else → the PUBLISHED feed, targeting-filtered
 * in the repo WHERE (correct pagination).
 */
export async function listAnnouncements(
  ctx: ServiceContext,
  input: ListAnnouncementsInput = {},
): Promise<AnnouncementDto[]> {
  assertCan(ctx.user, PERMISSIONS.ANNOUNCEMENT_READ);
  const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const before = input.before ? new Date(input.before) : undefined;

  if (isFullAccess(ctx)) {
    const rows = await ctx.repositories.announcements.list(ctx.user.schoolId, {
      ...(input.status ? { status: input.status } : {}),
      limit,
      ...(before ? { before } : {}),
    });
    return rows.map(mapAnnouncement);
  }

  // Teacher draft-management tab — own drafts only.
  if (input.status === "DRAFT") {
    if (!can(ctx.user.role, PERMISSIONS.ANNOUNCEMENT_DRAFT)) return [];
    const staffId = await resolveActingStaffId(ctx);
    const rows = await ctx.repositories.announcements.list(ctx.user.schoolId, {
      status: "DRAFT",
      createdByStaffId: staffId,
      limit,
      ...(before ? { before } : {}),
    });
    return rows.map(mapAnnouncement);
  }

  // Reader feed — PUBLISHED + targeted.
  const visibleTo = await readerVisibility(ctx);
  const rows = await ctx.repositories.announcements.list(ctx.user.schoolId, {
    status: "PUBLISHED",
    visibleTo,
    limit,
    ...(before ? { before } : {}),
  });
  return rows.map(mapAnnouncement);
}
