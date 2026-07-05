import { PERMISSIONS } from "@repo/constants";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@repo/core";
import type { Parent } from "@repo/db";
import type { ParentDto, PreferredContactKey, StudentParentDto, StudentRelationshipKey } from "@repo/types";

import { assertCan } from "../../authorization";
import type { ServiceContext } from "../../context";

import { mapParent, mapStudentParent } from "./mappers";
import { assertStudentInScope, isFullAccess, loadStudentInSchool, recordAudit } from "./scope";

export interface CreateParentInput {
  userId?: string | undefined;
  name: string;
  phone: string;
  email?: string | undefined;
  occupation?: string | undefined;
  address?: string | undefined;
  preferredContact?: PreferredContactKey | undefined;
}

export interface UpdateParentInput {
  userId?: string | null | undefined;
  name?: string | undefined;
  phone?: string | undefined;
  email?: string | null | undefined;
  occupation?: string | null | undefined;
  address?: string | null | undefined;
  preferredContact?: PreferredContactKey | undefined;
}

export interface LinkParentInput {
  studentId: string;
  parentId: string;
  relationship: StudentRelationshipKey;
  isPrimary?: boolean | undefined;
}

export interface UnlinkParentInput {
  studentId: string;
  parentId: string;
  relationship: StudentRelationshipKey;
}

/** List parents (admin → all; PARENT role → only their own record). */
export async function listParents(ctx: ServiceContext): Promise<ParentDto[]> {
  assertCan(ctx.user, PERMISSIONS.PARENT_READ);
  if (isFullAccess(ctx)) {
    const rows = await ctx.repositories.parents.list(ctx.user.schoolId);
    return rows.map(mapParent);
  }
  const own = await ctx.repositories.parents.findByUserId(ctx.user.userId);
  return own ? [mapParent(own)] : [];
}

export async function getParent(ctx: ServiceContext, id: string): Promise<ParentDto> {
  assertCan(ctx.user, PERMISSIONS.PARENT_READ);
  const parent = await loadParentInSchool(ctx, id);
  if (!isFullAccess(ctx) && parent.userId !== ctx.user.userId) {
    throw new ForbiddenError("Out of scope for this parent");
  }
  return mapParent(parent);
}

export async function createParent(ctx: ServiceContext, input: CreateParentInput): Promise<ParentDto> {
  assertCan(ctx.user, PERMISSIONS.PARENT_MANAGE);
  if (input.userId) {
    await assertUserInSchool(ctx, input.userId);
    if (await ctx.repositories.parents.findByUserId(input.userId)) {
      throw new ConflictError("That user is already linked to a parent record");
    }
  }
  return ctx.withTransaction(async (repos) => {
    const created = await repos.parents.create({ schoolId: ctx.user.schoolId, ...input });
    await recordAudit(ctx, repos, {
      action: "PARENT_CREATE",
      entityType: "Parent",
      entityId: created.id,
      after: { name: created.name },
    });
    return mapParent(created);
  });
}

export async function updateParent(
  ctx: ServiceContext,
  id: string,
  input: UpdateParentInput,
): Promise<ParentDto> {
  assertCan(ctx.user, PERMISSIONS.PARENT_MANAGE);
  const before = await loadParentInSchool(ctx, id);
  if (input.userId && input.userId !== before.userId) {
    await assertUserInSchool(ctx, input.userId);
    const clash = await ctx.repositories.parents.findByUserId(input.userId);
    if (clash && clash.id !== id) {
      throw new ConflictError("That user is already linked to a parent record");
    }
  }
  return ctx.withTransaction(async (repos) => {
    const after = await repos.parents.update(id, input);
    await recordAudit(ctx, repos, {
      action: "PARENT_UPDATE",
      entityType: "Parent",
      entityId: id,
      before: { name: before.name },
      after: { name: after.name },
    });
    return mapParent(after);
  });
}

export async function deleteParent(ctx: ServiceContext, id: string): Promise<void> {
  assertCan(ctx.user, PERMISSIONS.PARENT_MANAGE);
  const before = await loadParentInSchool(ctx, id);
  await ctx.withTransaction(async (repos) => {
    await repos.parents.delete(id);
    await recordAudit(ctx, repos, {
      action: "PARENT_DELETE",
      entityType: "Parent",
      entityId: id,
      before: { name: before.name },
    });
  });
}

/** Link a parent to a student with a relationship; at most one primary per student. */
export async function linkParent(
  ctx: ServiceContext,
  input: LinkParentInput,
): Promise<StudentParentDto> {
  assertCan(ctx.user, PERMISSIONS.PARENT_MANAGE);
  await loadStudentInSchool(ctx, input.studentId);
  await loadParentInSchool(ctx, input.parentId);

  if (
    await ctx.repositories.studentParents.findLink(input.studentId, input.parentId, input.relationship)
  ) {
    throw new ConflictError("That parent already has this relationship to the student");
  }

  return ctx.withTransaction(async (repos) => {
    if (input.isPrimary) {
      await repos.studentParents.clearPrimary(input.studentId);
    }
    const link = await repos.studentParents.create({
      studentId: input.studentId,
      parentId: input.parentId,
      relationship: input.relationship,
      ...(input.isPrimary !== undefined ? { isPrimary: input.isPrimary } : {}),
    });
    await recordAudit(ctx, repos, {
      action: "STUDENT_PARENT_LINK",
      entityType: "StudentParent",
      entityId: `${input.studentId}:${input.parentId}`,
      after: { relationship: input.relationship, isPrimary: link.isPrimary },
    });
    return mapStudentParent(link);
  });
}

export async function unlinkParent(ctx: ServiceContext, input: UnlinkParentInput): Promise<void> {
  assertCan(ctx.user, PERMISSIONS.PARENT_MANAGE);
  const link = await ctx.repositories.studentParents.findLink(
    input.studentId,
    input.parentId,
    input.relationship,
  );
  if (!link) {
    throw new NotFoundError("Parent link not found");
  }
  await ctx.withTransaction(async (repos) => {
    await repos.studentParents.delete(input.studentId, input.parentId, input.relationship);
    await recordAudit(ctx, repos, {
      action: "STUDENT_PARENT_UNLINK",
      entityType: "StudentParent",
      entityId: `${input.studentId}:${input.parentId}`,
      before: { relationship: input.relationship },
    });
  });
}

/** A student's guardians (student-scoped read: admin / own-section teacher / own-child parent). */
export async function listGuardians(
  ctx: ServiceContext,
  studentId: string,
): Promise<StudentParentDto[]> {
  assertCan(ctx.user, PERMISSIONS.STUDENT_READ);
  const student = await loadStudentInSchool(ctx, studentId);
  await assertStudentInScope(ctx, student);
  const rows = await ctx.repositories.studentParents.listByStudent(studentId);
  return rows.map(mapStudentParent);
}

async function loadParentInSchool(ctx: ServiceContext, id: string): Promise<Parent> {
  const parent = await ctx.repositories.parents.findById(id);
  if (!parent || parent.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Parent not found");
  }
  return parent;
}

async function assertUserInSchool(ctx: ServiceContext, userId: string): Promise<void> {
  const user = await ctx.repositories.users.findById(userId);
  if (!user || user.schoolId !== ctx.user.schoolId) {
    throw new ValidationError("Linked user not found in this school");
  }
}
