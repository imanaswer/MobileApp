import { PERMISSIONS } from "@repo/constants";
import { ConflictError, NotFoundError } from "@repo/core";
import type { Class } from "@repo/db";
import type { ClassDto } from "@repo/types";

import { assertCan } from "../../authorization";
import type { ServiceContext } from "../../context";

import { mapClass } from "./mappers";

export interface CreateClassInput {
  name: string;
  sortOrder?: number | undefined;
}

export interface UpdateClassInput {
  name?: string | undefined;
  sortOrder?: number | undefined;
}

export async function listClasses(ctx: ServiceContext): Promise<ClassDto[]> {
  assertCan(ctx.user, PERMISSIONS.ACADEMIC_READ);
  const rows = await ctx.repositories.classes.list(ctx.user.schoolId);
  return rows.map(mapClass);
}

export async function getClass(ctx: ServiceContext, id: string): Promise<ClassDto> {
  assertCan(ctx.user, PERMISSIONS.ACADEMIC_READ);
  return mapClass(await loadClass(ctx, id));
}

/** Create a class. Rule: name unique within the school. */
export async function createClass(
  ctx: ServiceContext,
  input: CreateClassInput,
): Promise<ClassDto> {
  assertCan(ctx.user, PERMISSIONS.ACADEMIC_MANAGE);
  if (await ctx.repositories.classes.findByName(ctx.user.schoolId, input.name)) {
    throw new ConflictError(`A class named "${input.name}" already exists`);
  }
  return ctx.withTransaction(async (repos) => {
    const created = await repos.classes.create({
      schoolId: ctx.user.schoolId,
      name: input.name,
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    });
    await recordClassAudit(ctx, repos, "CLASS_CREATE", created.id, null, created);
    return mapClass(created);
  });
}

export async function updateClass(
  ctx: ServiceContext,
  id: string,
  input: UpdateClassInput,
): Promise<ClassDto> {
  assertCan(ctx.user, PERMISSIONS.ACADEMIC_MANAGE);
  const before = await loadClass(ctx, id);
  if (input.name && input.name !== before.name) {
    const clash = await ctx.repositories.classes.findByName(ctx.user.schoolId, input.name);
    if (clash && clash.id !== id) {
      throw new ConflictError(`A class named "${input.name}" already exists`);
    }
  }
  return ctx.withTransaction(async (repos) => {
    const after = await repos.classes.update(id, input);
    await recordClassAudit(ctx, repos, "CLASS_UPDATE", id, before, after);
    return mapClass(after);
  });
}

/** Delete a class. Blocked (409) if it still has sections. */
export async function deleteClass(ctx: ServiceContext, id: string): Promise<void> {
  assertCan(ctx.user, PERMISSIONS.ACADEMIC_MANAGE);
  const before = await loadClass(ctx, id);
  if (await ctx.repositories.classes.hasSections(id)) {
    throw new ConflictError("Class has sections; remove them first");
  }
  await ctx.withTransaction(async (repos) => {
    await repos.classes.delete(id);
    await recordClassAudit(ctx, repos, "CLASS_DELETE", id, before, null);
  });
}

async function loadClass(ctx: ServiceContext, id: string): Promise<Class> {
  const row = await ctx.repositories.classes.findById(id);
  if (!row || row.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Class not found");
  }
  return row;
}

function recordClassAudit(
  ctx: ServiceContext,
  repos: ServiceContext["repositories"],
  action: string,
  entityId: string,
  before: Class | null,
  after: Class | null,
): Promise<void> {
  return repos.audit.record({
    schoolId: ctx.user.schoolId,
    actorUserId: ctx.user.userId,
    action,
    entityType: "Class",
    entityId,
    ...(before ? { before: { name: before.name, sortOrder: before.sortOrder } } : {}),
    ...(after ? { after: { name: after.name, sortOrder: after.sortOrder } } : {}),
  });
}
