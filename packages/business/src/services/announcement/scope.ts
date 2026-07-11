import { PERMISSIONS } from "@repo/constants";
import { can, ForbiddenError, NotFoundError, ValidationError } from "@repo/core";
import type {
  AnnouncementScope,
  AnnouncementVisibility,
  AnnouncementWithAttachments,
} from "@repo/db";

import type { ServiceContext } from "../../context";
import { activeYearId, isFullAccess, parentChildIds, teacherSectionIds } from "../people/scope";

export { recordAudit, isFullAccess } from "../people/scope";

/** The acting user's Staff row id — the B3 author actor (ADR-019 §1). */
export async function resolveActingStaffId(ctx: ServiceContext): Promise<string> {
  const staff = await ctx.repositories.staff.findByUserId(ctx.user.userId);
  if (!staff) {
    throw new ValidationError(
      "Acting user has no staff profile (required to author announcements)",
    );
  }
  return staff.id;
}

/** Load an announcement, enforcing tenant ownership (404 if missing / other-school). */
export async function loadAnnouncementInSchool(
  ctx: ServiceContext,
  id: string,
): Promise<AnnouncementWithAttachments> {
  const a = await ctx.repositories.announcements.findById(id);
  if (!a || a.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Announcement not found");
  }
  return a;
}

/**
 * Validate the (scope, targetId) pair: SECTION/CLASS need an in-school target;
 * WHOLE_SCHOOL/TEACHERS/PARENTS must carry no target (ADR-019 §2).
 */
export async function assertScopeTarget(
  ctx: ServiceContext,
  scope: AnnouncementScope,
  targetId: string | null | undefined,
): Promise<void> {
  if (scope === "SECTION") {
    if (!targetId) throw new ValidationError("A SECTION announcement needs a sectionId target");
    const section = await ctx.repositories.sections.findById(targetId);
    const cls = section ? await ctx.repositories.classes.findById(section.classId) : null;
    if (!cls || cls.schoolId !== ctx.user.schoolId) {
      throw new ValidationError("Target section not found");
    }
    return;
  }
  if (scope === "CLASS") {
    if (!targetId) throw new ValidationError("A CLASS announcement needs a classId target");
    const cls = await ctx.repositories.classes.findById(targetId);
    if (!cls || cls.schoolId !== ctx.user.schoolId) {
      throw new ValidationError("Target class not found");
    }
    return;
  }
  if (targetId) {
    throw new ValidationError(`A ${scope} announcement must not carry a target`);
  }
}

/** A teacher's own section ids and the class ids those sections belong to. */
async function teacherSectionClassIds(
  ctx: ServiceContext,
): Promise<{ sectionIds: string[]; classIds: string[] }> {
  const sectionIds = await teacherSectionIds(ctx);
  const sections = await Promise.all(
    sectionIds.map((id) => ctx.repositories.sections.findById(id)),
  );
  const classIds = [...new Set(sections.flatMap((s) => (s ? [s.classId] : [])))];
  return { sectionIds, classIds };
}

/** A parent's children's section + class ids (ACTIVE year). */
async function parentSectionClassIds(
  ctx: ServiceContext,
): Promise<{ sectionIds: string[]; classIds: string[] }> {
  const [childIds, yearId] = await Promise.all([parentChildIds(ctx), activeYearId(ctx)]);
  if (childIds.length === 0 || !yearId) {
    return { sectionIds: [], classIds: [] };
  }
  const enrollments = await Promise.all(
    childIds.map((sid) => ctx.repositories.enrollments.findByStudentYear(sid, yearId)),
  );
  const sectionIds = [...new Set(enrollments.flatMap((e) => (e?.sectionId ? [e.sectionId] : [])))];
  const classIds = [...new Set(enrollments.map((e) => e?.classId).filter((c): c is string => !!c))];
  return { sectionIds, classIds };
}

/**
 * Author gate (ADR-019 §7): admin (announcement:manage) authors any scope; a teacher
 * (announcement:draft) authors ONLY a SECTION/CLASS they teach. Parents are refused.
 * Applied to create / update / delete (draft) + attachment add/remove.
 */
export async function assertAnnouncementAuthor(
  ctx: ServiceContext,
  scope: AnnouncementScope,
  targetId: string | null | undefined,
): Promise<void> {
  if (can(ctx.user.role, PERMISSIONS.ANNOUNCEMENT_MANAGE)) return; // SA/OA — any scope
  if (!can(ctx.user.role, PERMISSIONS.ANNOUNCEMENT_DRAFT)) {
    throw new ForbiddenError(`Missing permission: ${PERMISSIONS.ANNOUNCEMENT_MANAGE}`);
  }
  if (scope !== "SECTION" && scope !== "CLASS") {
    throw new ForbiddenError("Teachers may only announce to their own sections or classes");
  }
  const owned = await teacherSectionClassIds(ctx);
  if (scope === "SECTION" && targetId && owned.sectionIds.includes(targetId)) return;
  if (scope === "CLASS" && targetId && owned.classIds.includes(targetId)) return;
  throw new ForbiddenError("Out of scope for this section/class");
}

/** A teacher may only modify/delete a DRAFT they authored; admin any (ADR-019 §7). */
export async function assertOwnsDraft(
  ctx: ServiceContext,
  a: AnnouncementWithAttachments,
): Promise<void> {
  if (isFullAccess(ctx)) return;
  if (!can(ctx.user.role, PERMISSIONS.ANNOUNCEMENT_DRAFT)) {
    throw new ForbiddenError(`Missing permission: ${PERMISSIONS.ANNOUNCEMENT_MANAGE}`);
  }
  const staff = await ctx.repositories.staff.findByUserId(ctx.user.userId);
  if (!staff || staff.id !== a.createdByStaffId) {
    throw new ForbiddenError("Not the author of this draft");
  }
}

/** The reader's targeting set — used to filter the feed and gate single reads. */
export async function readerVisibility(ctx: ServiceContext): Promise<AnnouncementVisibility> {
  if (ctx.user.role === "TEACHER") {
    const { sectionIds, classIds } = await teacherSectionClassIds(ctx);
    return { groups: ["WHOLE_SCHOOL", "TEACHERS"], sectionIds, classIds };
  }
  const { sectionIds, classIds } = await parentSectionClassIds(ctx);
  return { groups: ["WHOLE_SCHOOL", "PARENTS"], sectionIds, classIds };
}

function isTargetedPublished(a: AnnouncementWithAttachments, vis: AnnouncementVisibility): boolean {
  if (a.status !== "PUBLISHED") return false;
  if (vis.groups.includes(a.scope)) return true;
  if (a.scope === "SECTION" && a.targetId && vis.sectionIds.includes(a.targetId)) return true;
  if (a.scope === "CLASS" && a.targetId && vis.classIds.includes(a.targetId)) return true;
  return false;
}

/**
 * Single-item read gate (ADR-019 §6 — targeting is the business gate, RLS is coarse):
 * admin ALL; a teacher-author sees their own DRAFT; everyone else sees a PUBLISHED
 * announcement only if targeted. 404 (not 403) so existence never leaks.
 */
export async function assertCanReadAnnouncement(
  ctx: ServiceContext,
  a: AnnouncementWithAttachments,
): Promise<void> {
  if (isFullAccess(ctx)) return;
  if (can(ctx.user.role, PERMISSIONS.ANNOUNCEMENT_DRAFT)) {
    const staff = await ctx.repositories.staff.findByUserId(ctx.user.userId);
    if (staff && staff.id === a.createdByStaffId) return;
  }
  const vis = await readerVisibility(ctx);
  if (isTargetedPublished(a, vis)) return;
  throw new NotFoundError("Announcement not found");
}
