import { PERMISSIONS } from "@repo/constants";
import { ConflictError, NotFoundError } from "@repo/core";
import type { Class, Section } from "@repo/db";
import type { SectionDto } from "@repo/types";

import { assertCan } from "../../authorization";
import type { ServiceContext } from "../../context";

import { mapSection } from "./mappers";

export interface CreateSectionInput {
  classId: string;
  name: string;
}

export interface UpdateSectionInput {
  name?: string | undefined;
}

/** Read all sections of a class (class must belong to the actor's school). */
export async function listSections(ctx: ServiceContext, classId: string): Promise<SectionDto[]> {
  assertCan(ctx.user, PERMISSIONS.ACADEMIC_READ);
  await loadClassInSchool(ctx, classId);
  const rows = await ctx.repositories.sections.listByClass(classId);
  return rows.map(mapSection);
}

export async function getSection(ctx: ServiceContext, id: string): Promise<SectionDto> {
  assertCan(ctx.user, PERMISSIONS.ACADEMIC_READ);
  return mapSection(await loadSection(ctx, id));
}

/** Create a section. Rule: name unique within its class. */
export async function createSection(
  ctx: ServiceContext,
  input: CreateSectionInput,
): Promise<SectionDto> {
  assertCan(ctx.user, PERMISSIONS.ACADEMIC_MANAGE);
  await loadClassInSchool(ctx, input.classId);
  if (await ctx.repositories.sections.findByName(input.classId, input.name)) {
    throw new ConflictError(`A section named "${input.name}" already exists in this class`);
  }
  return ctx.withTransaction(async (repos) => {
    const created = await repos.sections.create(input);
    await recordSectionAudit(ctx, repos, "SECTION_CREATE", created.id, null, created);
    return mapSection(created);
  });
}

export async function updateSection(
  ctx: ServiceContext,
  id: string,
  input: UpdateSectionInput,
): Promise<SectionDto> {
  assertCan(ctx.user, PERMISSIONS.ACADEMIC_MANAGE);
  const before = await loadSection(ctx, id);
  if (input.name && input.name !== before.name) {
    const clash = await ctx.repositories.sections.findByName(before.classId, input.name);
    if (clash && clash.id !== id) {
      throw new ConflictError(`A section named "${input.name}" already exists in this class`);
    }
  }
  return ctx.withTransaction(async (repos) => {
    const after = await repos.sections.update(id, input);
    await recordSectionAudit(ctx, repos, "SECTION_UPDATE", id, before, after);
    return mapSection(after);
  });
}

/** Delete a section. Blocked (409) if teacher assignments still reference it. */
export async function deleteSection(ctx: ServiceContext, id: string): Promise<void> {
  assertCan(ctx.user, PERMISSIONS.ACADEMIC_MANAGE);
  const before = await loadSection(ctx, id);
  if (await ctx.repositories.sections.hasAssignments(id)) {
    throw new ConflictError("Section has teacher assignments; remove them first");
  }
  await ctx.withTransaction(async (repos) => {
    await repos.sections.delete(id);
    await recordSectionAudit(ctx, repos, "SECTION_DELETE", id, before, null);
  });
}

async function loadSection(ctx: ServiceContext, id: string): Promise<Section> {
  const row = await ctx.repositories.sections.findById(id);
  if (!row) {
    throw new NotFoundError("Section not found");
  }
  await loadClassInSchool(ctx, row.classId);
  return row;
}

async function loadClassInSchool(ctx: ServiceContext, classId: string): Promise<Class> {
  const cls = await ctx.repositories.classes.findById(classId);
  if (!cls || cls.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Class not found");
  }
  return cls;
}

function recordSectionAudit(
  ctx: ServiceContext,
  repos: ServiceContext["repositories"],
  action: string,
  entityId: string,
  before: Section | null,
  after: Section | null,
): Promise<void> {
  return repos.audit.record({
    schoolId: ctx.user.schoolId,
    actorUserId: ctx.user.userId,
    action,
    entityType: "Section",
    entityId,
    ...(before ? { before: { name: before.name } } : {}),
    ...(after ? { after: { name: after.name } } : {}),
  });
}
