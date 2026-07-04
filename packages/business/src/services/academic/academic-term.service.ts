import { PERMISSIONS } from "@repo/constants";
import { ConflictError, NotFoundError, ValidationError } from "@repo/core";
import type { AcademicTerm } from "@repo/db";
import type { AcademicTermDto } from "@repo/types";

import { assertCan } from "../../authorization";
import type { ServiceContext } from "../../context";

import { mapAcademicTerm } from "./mappers";

export interface CreateAcademicTermInput {
  academicYearId: string;
  name: string;
  startDate: Date;
  endDate: Date;
}

export interface UpdateAcademicTermInput {
  name?: string | undefined;
  startDate?: Date | undefined;
  endDate?: Date | undefined;
}

/** Read all terms of a year (year must belong to the actor's school). */
export async function listAcademicTerms(
  ctx: ServiceContext,
  academicYearId: string,
): Promise<AcademicTermDto[]> {
  assertCan(ctx.user, PERMISSIONS.ACADEMIC_READ);
  await assertYearInSchool(ctx, academicYearId);
  const rows = await ctx.repositories.academicTerms.listByYear(academicYearId);
  return rows.map(mapAcademicTerm);
}

export async function getAcademicTerm(ctx: ServiceContext, id: string): Promise<AcademicTermDto> {
  assertCan(ctx.user, PERMISSIONS.ACADEMIC_READ);
  return mapAcademicTerm(await loadTerm(ctx, id));
}

/** Create a term. Rules: year in school, name unique/year, start<end, no sibling overlap. */
export async function createAcademicTerm(
  ctx: ServiceContext,
  input: CreateAcademicTermInput,
): Promise<AcademicTermDto> {
  assertCan(ctx.user, PERMISSIONS.ACADEMIC_MANAGE);
  await assertYearInSchool(ctx, input.academicYearId);
  assertStartBeforeEnd(input.startDate, input.endDate);

  if (await ctx.repositories.academicTerms.findByName(input.academicYearId, input.name)) {
    throw new ConflictError(`A term named "${input.name}" already exists in this year`);
  }
  await assertNoOverlap(ctx, input.academicYearId, input.startDate, input.endDate);

  return ctx.withTransaction(async (repos) => {
    const created = await repos.academicTerms.create(input);
    await recordTermAudit(ctx, repos, "ACADEMIC_TERM_CREATE", created.id, null, created);
    return mapAcademicTerm(created);
  });
}

export async function updateAcademicTerm(
  ctx: ServiceContext,
  id: string,
  input: UpdateAcademicTermInput,
): Promise<AcademicTermDto> {
  assertCan(ctx.user, PERMISSIONS.ACADEMIC_MANAGE);
  const before = await loadTerm(ctx, id);

  const startDate = input.startDate ?? before.startDate;
  const endDate = input.endDate ?? before.endDate;
  assertStartBeforeEnd(startDate, endDate);

  if (input.name && input.name !== before.name) {
    const clash = await ctx.repositories.academicTerms.findByName(before.academicYearId, input.name);
    if (clash && clash.id !== id) {
      throw new ConflictError(`A term named "${input.name}" already exists in this year`);
    }
  }
  if (input.startDate || input.endDate) {
    await assertNoOverlap(ctx, before.academicYearId, startDate, endDate, id);
  }

  return ctx.withTransaction(async (repos) => {
    const after = await repos.academicTerms.update(id, input);
    await recordTermAudit(ctx, repos, "ACADEMIC_TERM_UPDATE", id, before, after);
    return mapAcademicTerm(after);
  });
}

export async function deleteAcademicTerm(ctx: ServiceContext, id: string): Promise<void> {
  assertCan(ctx.user, PERMISSIONS.ACADEMIC_MANAGE);
  const before = await loadTerm(ctx, id);
  await ctx.withTransaction(async (repos) => {
    await repos.academicTerms.delete(id);
    await recordTermAudit(ctx, repos, "ACADEMIC_TERM_DELETE", id, before, null);
  });
}

async function loadTerm(ctx: ServiceContext, id: string): Promise<AcademicTerm> {
  const row = await ctx.repositories.academicTerms.findById(id);
  if (!row) {
    throw new NotFoundError("Academic term not found");
  }
  // Tenant check via the owning year.
  await assertYearInSchool(ctx, row.academicYearId);
  return row;
}

async function assertYearInSchool(ctx: ServiceContext, academicYearId: string): Promise<void> {
  const year = await ctx.repositories.academicYears.findById(academicYearId);
  if (!year || year.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Academic year not found");
  }
}

function assertStartBeforeEnd(startDate: Date, endDate: Date): void {
  if (startDate.getTime() >= endDate.getTime()) {
    throw new ValidationError("startDate must be before endDate");
  }
}

async function assertNoOverlap(
  ctx: ServiceContext,
  academicYearId: string,
  startDate: Date,
  endDate: Date,
  excludeId?: string,
): Promise<void> {
  const overlap = await ctx.repositories.academicTerms.findOverlapping(
    academicYearId,
    startDate,
    endDate,
    excludeId,
  );
  if (overlap) {
    throw new ConflictError(`Dates overlap the term "${overlap.name}"`);
  }
}

function recordTermAudit(
  ctx: ServiceContext,
  repos: ServiceContext["repositories"],
  action: string,
  entityId: string,
  before: AcademicTerm | null,
  after: AcademicTerm | null,
): Promise<void> {
  return repos.audit.record({
    schoolId: ctx.user.schoolId,
    actorUserId: ctx.user.userId,
    action,
    entityType: "AcademicTerm",
    entityId,
    ...(before ? { before: { name: before.name } } : {}),
    ...(after ? { after: { name: after.name } } : {}),
  });
}
