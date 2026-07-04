import { PERMISSIONS } from "@repo/constants";
import { ConflictError, NotFoundError, ValidationError } from "@repo/core";
import type { AcademicYear } from "@repo/db";
import type { AcademicYearDto, AcademicYearStatusKey } from "@repo/types";

import { assertCan } from "../../authorization";
import type { ServiceContext } from "../../context";

import { mapAcademicYear } from "./mappers";

export interface CreateAcademicYearInput {
  name: string;
  startDate: Date;
  endDate: Date;
  status?: AcademicYearStatusKey | undefined;
}

export interface UpdateAcademicYearInput {
  name?: string | undefined;
  startDate?: Date | undefined;
  endDate?: Date | undefined;
  status?: AcademicYearStatusKey | undefined;
}

/** Read all academic years for the actor's school. */
export async function listAcademicYears(ctx: ServiceContext): Promise<AcademicYearDto[]> {
  assertCan(ctx.user, PERMISSIONS.ACADEMIC_READ);
  const rows = await ctx.repositories.academicYears.list(ctx.user.schoolId);
  return rows.map(mapAcademicYear);
}

/** Read one academic year (must belong to the actor's school). */
export async function getAcademicYear(ctx: ServiceContext, id: string): Promise<AcademicYearDto> {
  assertCan(ctx.user, PERMISSIONS.ACADEMIC_READ);
  return mapAcademicYear(await loadYear(ctx, id));
}

/** Create an academic year. Rules: name unique/school, start<end, ≤1 ACTIVE/school. */
export async function createAcademicYear(
  ctx: ServiceContext,
  input: CreateAcademicYearInput,
): Promise<AcademicYearDto> {
  assertCan(ctx.user, PERMISSIONS.ACADEMIC_MANAGE);
  assertStartBeforeEnd(input.startDate, input.endDate);

  if (await ctx.repositories.academicYears.findByName(ctx.user.schoolId, input.name)) {
    throw new ConflictError(`An academic year named "${input.name}" already exists`);
  }
  if (input.status === "ACTIVE") {
    await assertNoOtherActiveYear(ctx);
  }

  return ctx.withTransaction(async (repos) => {
    const created = await repos.academicYears.create({
      schoolId: ctx.user.schoolId,
      name: input.name,
      startDate: input.startDate,
      endDate: input.endDate,
      ...(input.status ? { status: input.status } : {}),
    });
    await recordYearAudit(ctx, repos, "ACADEMIC_YEAR_CREATE", created.id, null, created);
    return mapAcademicYear(created);
  });
}

/** Update an academic year (same invariants as create). */
export async function updateAcademicYear(
  ctx: ServiceContext,
  id: string,
  input: UpdateAcademicYearInput,
): Promise<AcademicYearDto> {
  assertCan(ctx.user, PERMISSIONS.ACADEMIC_MANAGE);
  const before = await loadYear(ctx, id);

  const startDate = input.startDate ?? before.startDate;
  const endDate = input.endDate ?? before.endDate;
  assertStartBeforeEnd(startDate, endDate);

  if (input.name && input.name !== before.name) {
    const clash = await ctx.repositories.academicYears.findByName(ctx.user.schoolId, input.name);
    if (clash && clash.id !== id) {
      throw new ConflictError(`An academic year named "${input.name}" already exists`);
    }
  }
  if (input.status === "ACTIVE" && before.status !== "ACTIVE") {
    await assertNoOtherActiveYear(ctx, id);
  }

  return ctx.withTransaction(async (repos) => {
    const after = await repos.academicYears.update(id, input);
    await recordYearAudit(ctx, repos, "ACADEMIC_YEAR_UPDATE", id, before, after);
    return mapAcademicYear(after);
  });
}

/** Delete an academic year (cascades its terms — DB Cascade). */
export async function deleteAcademicYear(ctx: ServiceContext, id: string): Promise<void> {
  assertCan(ctx.user, PERMISSIONS.ACADEMIC_MANAGE);
  const before = await loadYear(ctx, id);
  await ctx.withTransaction(async (repos) => {
    await repos.academicYears.delete(id);
    await recordYearAudit(ctx, repos, "ACADEMIC_YEAR_DELETE", id, before, null);
  });
}

async function loadYear(ctx: ServiceContext, id: string): Promise<AcademicYear> {
  const row = await ctx.repositories.academicYears.findById(id);
  if (!row || row.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Academic year not found");
  }
  return row;
}

function assertStartBeforeEnd(startDate: Date, endDate: Date): void {
  if (startDate.getTime() >= endDate.getTime()) {
    throw new ValidationError("startDate must be before endDate");
  }
}

async function assertNoOtherActiveYear(ctx: ServiceContext, excludeId?: string): Promise<void> {
  const active = await ctx.repositories.academicYears.findActive(ctx.user.schoolId);
  if (active && active.id !== excludeId) {
    throw new ConflictError(`"${active.name}" is already the active year; close it first`);
  }
}

function recordYearAudit(
  ctx: ServiceContext,
  repos: ServiceContext["repositories"],
  action: string,
  entityId: string,
  before: AcademicYear | null,
  after: AcademicYear | null,
): Promise<void> {
  return repos.audit.record({
    schoolId: ctx.user.schoolId,
    actorUserId: ctx.user.userId,
    action,
    entityType: "AcademicYear",
    entityId,
    ...(before ? { before: { name: before.name, status: before.status } } : {}),
    ...(after ? { after: { name: after.name, status: after.status } } : {}),
  });
}
