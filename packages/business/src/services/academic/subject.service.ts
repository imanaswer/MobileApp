import { PERMISSIONS } from "@repo/constants";
import { ConflictError, NotFoundError } from "@repo/core";
import type { Subject } from "@repo/db";
import type { SubjectDto } from "@repo/types";

import { assertCan } from "../../authorization";
import type { ServiceContext } from "../../context";

import { mapSubject } from "./mappers";

export interface CreateSubjectInput {
  name: string;
}

export interface UpdateSubjectInput {
  name?: string | undefined;
}

export async function listSubjects(ctx: ServiceContext): Promise<SubjectDto[]> {
  assertCan(ctx.user, PERMISSIONS.ACADEMIC_READ);
  const rows = await ctx.repositories.subjects.list(ctx.user.schoolId);
  return rows.map(mapSubject);
}

export async function getSubject(ctx: ServiceContext, id: string): Promise<SubjectDto> {
  assertCan(ctx.user, PERMISSIONS.ACADEMIC_READ);
  return mapSubject(await loadSubject(ctx, id));
}

/** Create a subject. Rule: name unique within the school. */
export async function createSubject(
  ctx: ServiceContext,
  input: CreateSubjectInput,
): Promise<SubjectDto> {
  assertCan(ctx.user, PERMISSIONS.ACADEMIC_MANAGE);
  if (await ctx.repositories.subjects.findByName(ctx.user.schoolId, input.name)) {
    throw new ConflictError(`A subject named "${input.name}" already exists`);
  }
  return ctx.withTransaction(async (repos) => {
    const created = await repos.subjects.create({ schoolId: ctx.user.schoolId, name: input.name });
    await recordSubjectAudit(ctx, repos, "SUBJECT_CREATE", created.id, null, created);
    return mapSubject(created);
  });
}

export async function updateSubject(
  ctx: ServiceContext,
  id: string,
  input: UpdateSubjectInput,
): Promise<SubjectDto> {
  assertCan(ctx.user, PERMISSIONS.ACADEMIC_MANAGE);
  const before = await loadSubject(ctx, id);
  if (input.name && input.name !== before.name) {
    const clash = await ctx.repositories.subjects.findByName(ctx.user.schoolId, input.name);
    if (clash && clash.id !== id) {
      throw new ConflictError(`A subject named "${input.name}" already exists`);
    }
  }
  return ctx.withTransaction(async (repos) => {
    const after = await repos.subjects.update(id, input);
    await recordSubjectAudit(ctx, repos, "SUBJECT_UPDATE", id, before, after);
    return mapSubject(after);
  });
}

/** Delete a subject. Blocked (409) if teacher assignments still reference it. */
export async function deleteSubject(ctx: ServiceContext, id: string): Promise<void> {
  assertCan(ctx.user, PERMISSIONS.ACADEMIC_MANAGE);
  const before = await loadSubject(ctx, id);
  if (await ctx.repositories.subjects.hasAssignments(id)) {
    throw new ConflictError("Subject has teacher assignments; remove them first");
  }
  await ctx.withTransaction(async (repos) => {
    await repos.subjects.delete(id);
    await recordSubjectAudit(ctx, repos, "SUBJECT_DELETE", id, before, null);
  });
}

async function loadSubject(ctx: ServiceContext, id: string): Promise<Subject> {
  const row = await ctx.repositories.subjects.findById(id);
  if (!row || row.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Subject not found");
  }
  return row;
}

function recordSubjectAudit(
  ctx: ServiceContext,
  repos: ServiceContext["repositories"],
  action: string,
  entityId: string,
  before: Subject | null,
  after: Subject | null,
): Promise<void> {
  return repos.audit.record({
    schoolId: ctx.user.schoolId,
    actorUserId: ctx.user.userId,
    action,
    entityType: "Subject",
    entityId,
    ...(before ? { before: { name: before.name } } : {}),
    ...(after ? { after: { name: after.name } } : {}),
  });
}
