import { PERMISSIONS } from "@repo/constants";
import { ValidationError } from "@repo/core";
import type { GradeScaleDto } from "@repo/types";

import { assertCan } from "../../authorization";
import type { ServiceContext } from "../../context";

import { mapGradeScale, recordAudit } from "./scope";

export interface GradeBandInput {
  grade: string;
  minPercent: number;
  maxPercent: number;
  gradePoint?: number | null | undefined;
}

export interface CreateGradeScaleInput {
  name: string;
  isDefault: boolean;
  bands: GradeBandInput[];
}

/** Friendly pre-check (the DB EXCLUDE/CHECK are the race-free guarantee — ADR-012 §3a):
 *  non-empty, each band's bounds valid, and no overlap. */
function validateBands(bands: GradeBandInput[]): void {
  if (bands.length === 0) {
    throw new ValidationError("A grade scale needs at least one band");
  }
  for (const b of bands) {
    if (!(b.minPercent >= 0 && b.maxPercent > b.minPercent)) {
      throw new ValidationError(`Grade "${b.grade}" has invalid bounds`);
    }
  }
  const sorted = [...bands].sort((a, b) => a.minPercent - b.minPercent);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i]!.minPercent < sorted[i - 1]!.maxPercent) {
      throw new ValidationError("Grade bands must not overlap");
    }
  }
}

/** Create a configurable grade scale + its bands (admin). Non-overlap enforced at
 *  the DB; this validates for a friendly message. Audited. */
export async function createGradeScale(
  ctx: ServiceContext,
  input: CreateGradeScaleInput,
): Promise<GradeScaleDto> {
  assertCan(ctx.user, PERMISSIONS.EXAM_MANAGE);
  validateBands(input.bands);

  return ctx.withTransaction(async (repos) => {
    const created = await repos.gradeScales.create({
      schoolId: ctx.user.schoolId,
      name: input.name,
      isDefault: input.isDefault,
      bands: input.bands.map((b) => ({
        grade: b.grade,
        minPercent: b.minPercent,
        maxPercent: b.maxPercent,
        gradePoint: b.gradePoint ?? null,
      })),
    });
    await recordAudit(ctx, repos, {
      action: "GRADE_SCALE_CREATE",
      entityType: "GradeScale",
      entityId: created.id,
      after: { name: created.name, isDefault: created.isDefault, bandCount: created.bands.length },
    });
    return mapGradeScale(created);
  });
}

/** List the school's grade scales (admin — grade-scale management). */
export async function listGradeScales(ctx: ServiceContext): Promise<GradeScaleDto[]> {
  assertCan(ctx.user, PERMISSIONS.EXAM_MANAGE);
  const rows = await ctx.repositories.gradeScales.listBySchool(ctx.user.schoolId);
  return rows.map(mapGradeScale);
}
